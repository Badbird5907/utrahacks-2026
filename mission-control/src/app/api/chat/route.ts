import { google } from '@ai-sdk/google';
import { streamText, tool, convertToModelMessages, UIMessage } from 'ai';
import { z } from 'zod';

// Allow streaming responses up to 60 seconds
export const maxDuration = 60;

// System prompt for the Arduino coding assistant
const SYSTEM_PROMPT = `You are an expert Arduino programming assistant integrated into Mission Control, an Arduino IDE. You help users write, debug, and improve their Arduino sketches.

Your capabilities:
1. Answer questions about Arduino programming, electronics, and embedded systems
2. Explain code and suggest improvements
3. Help debug compilation errors and runtime issues
4. Edit files when the user asks you to make changes
5. Read serial monitor output to debug runtime behavior (use readSerialLogs tool)

When editing files:
- Use the editFile tool with a unified diff patch to make changes
- Use the listFiles tool to list the files in the project (use "./" for the project root)
- Use the readFile tool to read files not already in context
- Use the readSerialLogs tool to check what the Arduino is outputting via Serial.print()
- Always use relative paths (e.g., "./sketch.ino", "./lib/helpers.h")

## Unified Diff Format

When using editFile, generate a standard unified diff patch:

\`\`\`
--- a/filename
+++ b/filename
@@ -start,count +start,count @@
 context line (unchanged, prefix with single space)
-removed line (prefix with -)
+added line (prefix with +)
 context line
\`\`\`

Important diff rules:
- Include at least 3 lines of context around each change
- Context lines MUST match the actual file content exactly
- Use a single space prefix for unchanged context lines
- The line numbers in @@ don't need to be perfect - focus on correct context
- One file per editFile call - use multiple calls for multiple files
- Make minimal, focused changes

When users @mention files, their contents are provided as context with relative paths. Use these relative paths when referencing or editing files.

Be concise but helpful. Use code blocks with appropriate syntax highlighting.`;

function buildSystemPrompt(fileContents: Record<string, string>): string {
  if (Object.keys(fileContents).length === 0) {
    return SYSTEM_PROMPT;
  }

  const fileContext = Object.entries(fileContents)
    .map(([path, content]) => {
      const fileName = path.split('/').pop() || path;
      return `### File: ${fileName}\nPath: ${path}\n\`\`\`cpp\n${content}\n\`\`\``;
    })
    .join('\n\n');

  return `${SYSTEM_PROMPT}

## Current File Context

The user has provided the following files for context:

${fileContext}

When referencing these files, use the relative paths shown above (e.g., "./sketch.ino").`;
}

export async function POST(req: Request) {
  try {
    const { messages, fileContents = {} }: { messages: UIMessage[], fileContents?: Record<string, string> } = await req.json();

    const systemPrompt = buildSystemPrompt(fileContents);

    const result = streamText({
      model: google('gemini-3-pro-preview'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      providerOptions: {
        google: {
          thinkingConfig: {
            thinkingLevel: 'low', // for demo reasons
            includeThoughts: true,
          }
        }
      },
      tools: {
        editFile: tool({
          description: 'Edit a file by providing a unified diff patch. Generate a standard unified diff format showing the changes to make. Include 3+ lines of context for reliable matching. The patch will be applied by a specialized model that can handle minor context variations.',
          inputSchema: z.object({
            filePath: z.string().describe('The relative path of the file to edit (e.g., "./sketch.ino", "./lib/helpers.h")'),
            patch: z.string().describe('A unified diff patch starting with --- a/filename and +++ b/filename, followed by hunks with @@ line markers. Include context lines (prefixed with space), removed lines (prefixed with -), and added lines (prefixed with +).'),
            description: z.string().describe('A brief description of what this edit does'),
          }),
          // No execute function - this is a client-side tool
          // The frontend will handle the actual file edit via onToolCall
        }),
        listFiles: tool({
          description: 'List the files in the project',
          inputSchema: z.object({
            path: z.string().describe('The relative path to list files from (use "./" for project root)'),
          }),
          // Client-side tool - no execute function
        }),
        readFile: tool({
          description: 'Read the contents of a file in the project. Use this when you need to see file contents that were not @mentioned by the user.',
          inputSchema: z.object({
            filePath: z.string().describe('The relative path of the file to read (e.g., "./sketch.ino")'),
          }),
          // Client-side tool - no execute function
        }),
        readSerialLogs: tool({
          description: 'Read the recent serial monitor logs from the Arduino. Use this to see what the Arduino is outputting via Serial.print() statements. This is useful for debugging runtime behavior, checking sensor readings, or understanding what the Arduino is doing.',
          inputSchema: z.object({
            limit: z.number().optional().describe('Maximum number of log lines to return (default: 50, max: 500)'),
          }),
          // Client-side tool - no execute function
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error: unknown) {
    console.error('Chat API error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
