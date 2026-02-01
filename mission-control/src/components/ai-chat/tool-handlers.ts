import { getDaemonClient } from "@/lib/daemon-client";
import { applyPatch } from "@/lib/apply-patch";
import { toAbsolutePath, formatFileTree } from "./path-utils";
import { type ToolCall, type AddToolOutput } from "./types";

// Maximum content length to include in error messages for retry context
const MAX_CONTENT_PREVIEW = 1500;

interface ToolHandlerContext {
  sketchPath: string | null;
  reloadFile: (path: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  pushEdit: (edit: {
    filePath: string;
    previousContent: string;
    newContent: string;
    description: string;
  }) => string;
}

export function createToolHandlers(
  context: ToolHandlerContext,
  addToolOutput: AddToolOutput
) {
  const handleEditFile = async (toolCall: ToolCall) => {
    if (!addToolOutput) {
      console.error("addToolOutput not available");
      return;
    }

    const { filePath: rawFilePath, patch, description } = toolCall.input as {
      filePath: string;
      patch: string;
      description: string;
    };

    const filePath = context.sketchPath 
      ? toAbsolutePath(rawFilePath, context.sketchPath) 
      : rawFilePath;

    try {
      const client = getDaemonClient();
      const currentFile = await client.readFile(filePath);
      const originalContent = currentFile.content;

      // Apply patch via Flash model
      const result = await applyPatch(filePath, patch, originalContent);

      if (!result.success) {
        // Return error with file content context for Pro to regenerate
        const contentPreview = originalContent.length > MAX_CONTENT_PREVIEW
          ? originalContent.substring(0, MAX_CONTENT_PREVIEW) + "\n... (truncated)"
          : originalContent;

        addToolOutput({
          tool: "editFile",
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: `Patch application failed: ${result.error}

The patch could not be applied to the file. Please regenerate the patch with corrected context that matches the actual file content.

Current file content (${rawFilePath}):
\`\`\`
${contentPreview}
\`\`\``,
        });
        return;
      }

      // Patch applied successfully
      const newContent = result.newContent!;

      // Record edit for undo functionality
      const editId = context.pushEdit({
        filePath,
        previousContent: originalContent,
        newContent,
        description,
      });

      // Write the patched content to disk
      await client.writeFile(filePath, newContent);
      await context.reloadFile(filePath);
      await context.refreshFileTree();

      // Build success output, include warning if present
      const output: Record<string, unknown> = {
        success: true,
        filePath: rawFilePath,
        editId,
        description,
      };

      if (result.syntaxWarning) {
        output.syntaxWarning = result.syntaxWarning;
      }

      addToolOutput({
        tool: "editFile",
        toolCallId: toolCall.toolCallId,
        output,
      });
    } catch (error) {
      console.error("Failed to edit file:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addToolOutput({
        tool: "editFile",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: `Error editing file: ${message}`,
      });
    }
  };

  const handleReadFile = async (toolCall: ToolCall) => {
    if (!addToolOutput) {
      console.error("addToolOutput not available");
      return;
    }

    const { filePath: rawFilePath } = toolCall.input as { filePath: string };

    const filePath = context.sketchPath 
      ? toAbsolutePath(rawFilePath, context.sketchPath) 
      : rawFilePath;

    try {
      const client = getDaemonClient();
      const result = await client.readFile(filePath);

      addToolOutput({
        tool: "readFile",
        toolCallId: toolCall.toolCallId,
        output: {
          filePath: rawFilePath,
          content: result.content,
        },
      });
    } catch (error) {
      console.error("Failed to read file:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addToolOutput({
        tool: "readFile",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: `Could not read file: ${message}`,
      });
    }
  };

  const handleListFiles = async (toolCall: ToolCall) => {
    if (!addToolOutput) {
      console.error("addToolOutput not available");
      return;
    }

    const { path: rawPath } = toolCall.input as { path: string };

    const absolutePath = context.sketchPath 
      ? toAbsolutePath(rawPath, context.sketchPath) 
      : rawPath;

    try {
      const client = getDaemonClient();
      const files = await client.listDirectory(absolutePath);
      const fileList = formatFileTree(files);

      addToolOutput({
        tool: "listFiles",
        toolCallId: toolCall.toolCallId,
        output: fileList,
      });
    } catch (error) {
      console.error("Failed to list files:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addToolOutput({
        tool: "listFiles",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: `Could not list files: ${message}`,
      });
    }
  };

  return {
    handleEditFile,
    handleReadFile,
    handleListFiles,
  };
}
