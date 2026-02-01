import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

// Configuration flags
const VALIDATE_SYNTAX_DEFAULT = true;

// Allow up to 60 seconds for Flash to respond
export const maxDuration = 60;

interface ApplyPatchRequest {
  filePath: string;
  patch: string;
  originalContent: string;
  validateSyntax?: boolean;
}

interface ApplyPatchResponse {
  success: boolean;
  newContent?: string;
  error?: string;
  syntaxWarning?: string;
}

function buildSystemPrompt(validateSyntax: boolean): string {
  const basePrompt = `You are a precise code patch applicator. Your ONLY job is to apply a unified diff patch to source code.

RULES:
1. Apply the patch changes EXACTLY as specified in the diff
2. Output ONLY the complete modified file content
3. Do NOT include any explanation, markdown, code fences, or commentary
4. Do NOT wrap your output in \`\`\` or any other formatting
5. If the patch context doesn't match the file content well enough to apply, respond with ONLY:
   ERROR: <specific reason why it cannot be applied>
6. Preserve ALL original formatting, indentation, and whitespace that is not being changed
7. Do not add, remove, or modify anything beyond what the patch specifies
8. Lines starting with - should be removed
9. Lines starting with + should be added
10. Lines starting with a space (context lines) should remain unchanged`;

  if (validateSyntax) {
    return `${basePrompt}

VALIDATION:
After applying the patch, do a quick check for obviously broken syntax:
- Severely unbalanced braces { }
- Severely unbalanced parentheses ( )
- Severely unbalanced brackets [ ]
If syntax appears obviously broken due to a bad patch application, prepend your output with:
WARNING: <brief issue description>
Then on the next line, output the patched content anyway.`;
  }

  return basePrompt;
}

function buildUserMessage(filePath: string, originalContent: string, patch: string): string {
  return `Apply this unified diff patch to the file.

ORIGINAL FILE (${filePath}):
${originalContent}

PATCH TO APPLY:
${patch}

Output the complete modified file content with the patch applied:`;
}

function parseFlashResponse(response: string): ApplyPatchResponse {
  const trimmed = response.trim();

  // Check for error
  if (trimmed.startsWith('ERROR:')) {
    const errorMessage = trimmed.substring(6).trim();
    return {
      success: false,
      error: errorMessage,
    };
  }

  // Check for warning
  if (trimmed.startsWith('WARNING:')) {
    const lines = trimmed.split('\n');
    const warningLine = lines[0];
    const warningMessage = warningLine.substring(8).trim();
    const content = lines.slice(1).join('\n');

    return {
      success: true,
      newContent: content,
      syntaxWarning: warningMessage,
    };
  }

  // Clean response - remove any accidental markdown code fences
  let cleanContent = trimmed;
  
  // Remove leading ```language and trailing ```
  if (cleanContent.startsWith('```')) {
    const firstNewline = cleanContent.indexOf('\n');
    if (firstNewline !== -1) {
      cleanContent = cleanContent.substring(firstNewline + 1);
    }
  }
  if (cleanContent.endsWith('```')) {
    cleanContent = cleanContent.substring(0, cleanContent.length - 3).trimEnd();
  }

  return {
    success: true,
    newContent: cleanContent,
  };
}

export async function POST(req: Request): Promise<Response> {
  try {
    const body: ApplyPatchRequest = await req.json();
    const { filePath, patch, originalContent, validateSyntax = VALIDATE_SYNTAX_DEFAULT } = body;

    // Validate required fields
    if (!filePath || !patch || originalContent === undefined) {
      return Response.json(
        { success: false, error: 'Missing required fields: filePath, patch, originalContent' },
        { status: 400 }
      );
    }

    const systemPrompt = buildSystemPrompt(validateSyntax);
    const userMessage = buildUserMessage(filePath, originalContent, patch);


    console.log("Applying patch with gemini-3-flash-preview")
    const result = await generateText({
      model: google('gemini-2.5-flash-preview-09-2025'),
      system: systemPrompt,
      prompt: userMessage,
      temperature: 0, // Deterministic output
      providerOptions: {
        google: {
          thinkingBudget: 0,
        }
      },
    });
    // console.log("Result:", result.text);

    const response = parseFlashResponse(result.text);

    return Response.json(response);
  } catch (error: unknown) {
    console.error('Apply patch API error:', error);
    const message = error instanceof Error ? error.message : 'An error occurred';
    return Response.json(
      { success: false, error: `Internal error: ${message}` },
      { status: 500 }
    );
  }
}
