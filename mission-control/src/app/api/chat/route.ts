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

When editing files:
- Use the editFile tool to make changes
- Use the listFiles tool to list the files in the project (use "./" for the project root)
- Be precise with the oldContent parameter - it must exactly match existing code
- Make minimal, focused changes
- Explain what you changed and why
- Always use relative paths (e.g., "./sketch.ino", "./lib/helpers.h")

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
      model: google('gemini-2.5-flash-preview-09-2025'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: {
        editFile: tool({
          description: 'Edit a file by finding and replacing content. Use this when the user asks you to modify, fix, or update code in a file. The file must be @mentioned in the conversation to have its content available.',
          inputSchema: z.object({
            filePath: z.string().describe('The relative path of the file to edit (e.g., "./sketch.ino", "./lib/helpers.h")'),
            oldContent: z.string().describe('The exact content to find and replace. Must match exactly including whitespace and newlines.'),
            newContent: z.string().describe('The new content to replace the old content with'),
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
