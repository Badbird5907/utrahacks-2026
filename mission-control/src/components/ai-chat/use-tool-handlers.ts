import { useEffect, useRef, useCallback, useLayoutEffect } from "react";
import { createToolHandlers } from "./tool-handlers";
import { type ToolCall, type AddToolOutput } from "./types";

interface UseToolHandlersProps {
  sketchPath: string | null;
  reloadFile: (path: string) => Promise<void>;
  refreshFileTree: () => Promise<void>;
  pushEdit: (edit: {
    filePath: string;
    previousContent: string;
    newContent: string;
    description: string;
  }) => string;
  addToolOutput: AddToolOutput;
}

export function useToolHandlers({
  sketchPath,
  reloadFile,
  refreshFileTree,
  pushEdit,
  addToolOutput,
}: UseToolHandlersProps) {
  const sketchPathRef = useRef(sketchPath);
  const reloadFileRef = useRef(reloadFile);
  const refreshFileTreeRef = useRef(refreshFileTree);
  const pushEditRef = useRef(pushEdit);
  const addToolOutputRef = useRef<AddToolOutput | null>(null);

  useEffect(() => {
    sketchPathRef.current = sketchPath;
    reloadFileRef.current = reloadFile;
    refreshFileTreeRef.current = refreshFileTree;
    pushEditRef.current = pushEdit;
  }, [sketchPath, reloadFile, refreshFileTree, pushEdit]);

  useLayoutEffect(() => {
    addToolOutputRef.current = addToolOutput;
  }, [addToolOutput]);

  const getContext = useCallback(() => ({
    sketchPath: sketchPathRef.current,
    reloadFile: reloadFileRef.current,
    refreshFileTree: refreshFileTreeRef.current,
    pushEdit: pushEditRef.current,
  }), []);

  const handleEditFile = useCallback(
    async (toolCall: ToolCall) => {
      if (!addToolOutputRef.current) return;
      const handlers = createToolHandlers(getContext(), addToolOutputRef.current);
      await handlers.handleEditFile(toolCall);
    },
    [getContext]
  );

  const handleReadFile = useCallback(
    async (toolCall: ToolCall) => {
      if (!addToolOutputRef.current) return;
      const handlers = createToolHandlers(getContext(), addToolOutputRef.current);
      await handlers.handleReadFile(toolCall);
    },
    [getContext]
  );

  const handleListFiles = useCallback(
    async (toolCall: ToolCall) => {
      if (!addToolOutputRef.current) return;
      const handlers = createToolHandlers(getContext(), addToolOutputRef.current);
      await handlers.handleListFiles(toolCall);
    },
    [getContext]
  );

  const handleReadSerialLogs = useCallback(
    async (toolCall: ToolCall) => {
      if (!addToolOutputRef.current) return;
      const handlers = createToolHandlers(getContext(), addToolOutputRef.current);
      await handlers.handleReadSerialLogs(toolCall);
    },
    [getContext]
  );

  const handleVerifySketch = useCallback(
    async (toolCall: ToolCall) => {
      if (!addToolOutputRef.current) return;
      const handlers = createToolHandlers(getContext(), addToolOutputRef.current);
      await handlers.handleVerifySketch(toolCall);
    },
    [getContext]
  );

  const handleUploadSketch = useCallback(
    async (toolCall: ToolCall) => {
      if (!addToolOutputRef.current) return;
      const handlers = createToolHandlers(getContext(), addToolOutputRef.current);
      await handlers.handleUploadSketch(toolCall);
    },
    [getContext]
  );

  const handleToolCall = useCallback(
    async (toolCall: ToolCall) => {
      if ("dynamic" in toolCall && toolCall.dynamic) {
        return;
      }

      if (!toolCall.input) {
        return;
      }

      const toolName = toolCall.toolName;

      try {
        if (toolName === "editFile") {
          await handleEditFile(toolCall);
        } else if (toolName === "readFile") {
          await handleReadFile(toolCall);
        } else if (toolName === "listFiles") {
          await handleListFiles(toolCall);
        } else if (toolName === "readSerialLogs") {
          await handleReadSerialLogs(toolCall);
        } else if (toolName === "verifySketch") {
          await handleVerifySketch(toolCall);
        } else if (toolName === "uploadSketch") {
          await handleUploadSketch(toolCall);
        }
      } catch (error) {
        console.error("Tool call failed:", toolName, error);
      }
    },
    [handleEditFile, handleReadFile, handleListFiles, handleReadSerialLogs, handleVerifySketch, handleUploadSketch]
  );

  return { handleToolCall };
}
