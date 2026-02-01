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
- Use the listFiles tool to list the files in the project
- Be precise with the oldContent parameter - it must exactly match existing code
- Make minimal, focused changes
- Explain what you changed and why

When users @mention files, their contents are provided as context. Reference these files when answering questions or making edits.

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

When referencing these files, use their full paths for the editFile tool.`;
}

export async function POST(req: Request) {
  try {
    const { messages, fileContents = {} }: { messages: UIMessage[], fileContents?: Record<string, string> } = await req.json();

    const systemPrompt = buildSystemPrompt(fileContents);

    const result = streamText({
      model: google('gemini-3-pro-preview'),
      system: systemPrompt,
      messages: await convertToModelMessages(messages),
      tools: {
        editFile: tool({
          description: 'Edit a file by finding and replacing content. Use this when the user asks you to modify, fix, or update code in a file. The file must be @mentioned in the conversation to have its content available.',
          inputSchema: z.object({
            filePath: z.string().describe('The full path of the file to edit (use the path from the file context)'),
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
            path: z.string().describe('The path to list the files from'),
          }),
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
