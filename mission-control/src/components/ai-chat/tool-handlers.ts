import { getDaemonClient } from "@/lib/daemon-client";
import { useDaemonStore } from "@/lib/daemon-state";
import { applyPatch } from "@/lib/apply-patch";
import { toAbsolutePath, formatFileTree } from "./path-utils";
import { type ToolCall, type AddToolOutput } from "./types";

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

      const result = await applyPatch(filePath, patch, originalContent);

      if (!result.success) {
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

      const newContent = result.newContent!;
      const editId = context.pushEdit({
        filePath,
        previousContent: originalContent,
        newContent,
        description,
      });

      await client.writeFile(filePath, newContent);
      await context.reloadFile(filePath);
      await context.refreshFileTree();
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

  const handleReadSerialLogs = async (toolCall: ToolCall) => {
    if (!addToolOutput) {
      console.error("addToolOutput not available");
      return;
    }

    const { limit = 50 } = toolCall.input as { limit?: number };
    const clampedLimit = Math.min(Math.max(limit, 1), 500);

    try {
      const client = getDaemonClient();
      const { logs, count } = await client.getSerialLogs(clampedLimit);

      if (logs.length === 0) {
        addToolOutput({
          tool: "readSerialLogs",
          toolCallId: toolCall.toolCallId,
          output: {
            message: "No serial logs available. The serial monitor may not be connected, or the Arduino hasn't sent any output yet.",
            logs: "",
            lineCount: 0,
          },
        });
        return;
      }

      addToolOutput({
        tool: "readSerialLogs",
        toolCallId: toolCall.toolCallId,
        output: {
          logs: logs.join('\n'),
          lineCount: count,
        },
      });
    } catch (error) {
      console.error("Failed to read serial logs:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addToolOutput({
        tool: "readSerialLogs",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: `Could not read serial logs: ${message}`,
      });
    }
  };

  const handleVerifySketch = async (toolCall: ToolCall) => {
    if (!addToolOutput) {
      console.error("addToolOutput not available");
      return;
    }

    if (!context.sketchPath) {
      addToolOutput({
        tool: "verifySketch",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: "No sketch is currently open. Please open a project first.",
      });
      return;
    }

    try {
      const store = useDaemonStore.getState();
      
      // Check daemon connection
      if (store.status !== "connected") {
        addToolOutput({
          tool: "verifySketch",
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: "Not connected to the daemon. Please ensure the daemon is running.",
        });
        return;
      }

      store.clearCompileLogs();
      const success = await store.compileSketch(context.sketchPath);
      const logs = useDaemonStore.getState().compileLogs;
      addToolOutput({
        tool: "verifySketch",
        toolCallId: toolCall.toolCallId,
        output: {
          success,
          output: logs.join('\n'),
          message: success 
            ? "Compilation successful! The sketch compiled without errors."
            : "Compilation failed. See output for error details.",
        },
      });
    } catch (error) {
      console.error("Failed to verify sketch:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addToolOutput({
        tool: "verifySketch",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: `Verification failed: ${message}`,
      });
    }
  };

  const handleUploadSketch = async (toolCall: ToolCall) => {
    if (!addToolOutput) {
      console.error("addToolOutput not available");
      return;
    }

    if (!context.sketchPath) {
      addToolOutput({
        tool: "uploadSketch",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: "No sketch is currently open. Please open a project first.",
      });
      return;
    }

    try {
      const store = useDaemonStore.getState();
      if (store.status !== "connected") {
        addToolOutput({
          tool: "uploadSketch",
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: "Not connected to the daemon. Please ensure the daemon is running.",
        });
        return;
      }

      store.clearCompileLogs();
      const success = await store.uploadSketch(context.sketchPath);
      const logs = useDaemonStore.getState().compileLogs;
      addToolOutput({
        tool: "uploadSketch",
        toolCallId: toolCall.toolCallId,
        output: {
          success,
          output: logs.join('\n'),
          message: success 
            ? "Upload successful! The sketch has been uploaded to the Arduino."
            : "Upload failed. See output for error details.",
        },
      });
    } catch (error) {
      console.error("Failed to upload sketch:", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      addToolOutput({
        tool: "uploadSketch",
        toolCallId: toolCall.toolCallId,
        state: "output-error",
        errorText: `Upload failed: ${message}`,
      });
    }
  };

  return {
    handleEditFile,
    handleReadFile,
    handleListFiles,
    handleReadSerialLogs,
    handleVerifySketch,
    handleUploadSketch,
  };
}
