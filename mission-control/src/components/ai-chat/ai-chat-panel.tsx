"use client";

import { useState, useRef, useEffect, useCallback, useLayoutEffect } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import {
  lastAssistantMessageIsCompleteWithToolCalls,
} from "ai";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { type MentionedFile } from "./file-mention-popover";

import { useProjectStore } from "@/lib/project-state";
import { useAIChatStore } from "@/lib/ai-chat-state";
import { getDaemonClient, type FileEntry } from "@/lib/daemon-client";

function formatFileTree(entries: FileEntry[], indent = ""): string {
  let result = "";
  for (const entry of entries) {
    result += `${indent}${entry.type === "directory" ? "📁" : "📄"} ${entry.name}\n`;
    if (entry.type === "directory" && entry.children) {
      result += formatFileTree(entry.children, indent + "  ");
    }
  }
  return result;
}

/**
 * Convert an absolute path to a relative path based on the sketch path.
 * Example: "C:/Users/foo/sketch/main.ino" -> "./main.ino"
 */
function toRelativePath(absolutePath: string, sketchPath: string): string {
  const normalizedAbsolute = absolutePath.replace(/\\/g, "/");
  const normalizedSketch = sketchPath.replace(/\\/g, "/");
  
  if (normalizedAbsolute.startsWith(normalizedSketch)) {
    const relative = normalizedAbsolute.slice(normalizedSketch.length);
    // Remove leading slash and add "./"
    return "./" + relative.replace(/^\//, "");
  }
  return absolutePath;
}

/**
 * Convert a relative path to an absolute path based on the sketch path.
 * Example: "./main.ino" -> "C:/Users/foo/sketch/main.ino"
 */
function toAbsolutePath(relativePath: string, sketchPath: string): string {
  const normalizedSketch = sketchPath.replace(/\\/g, "/");
  
  // Handle relative paths starting with "./"
  if (relativePath.startsWith("./")) {
    return normalizedSketch + "/" + relativePath.slice(2);
  }
  // Handle relative paths without "./"
  if (!relativePath.includes(":") && !relativePath.startsWith("/")) {
    return normalizedSketch + "/" + relativePath;
  }
  // Already absolute
  return relativePath;
}

export function AIChatPanel() {
  const fileTree = useProjectStore((s) => s.fileTree);
  const sketchPath = useProjectStore((s) => s.sketchPath);
  const reloadFile = useProjectStore((s) => s.reloadFile);
  const refreshFileTree = useProjectStore((s) => s.refreshFileTree);
  const pushEdit = useAIChatStore((s) => s.pushEdit);

  const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Store the latest sketchPath in a ref so tool handlers always have the current value
  const sketchPathRef = useRef(sketchPath);
  useEffect(() => {
    sketchPathRef.current = sketchPath;
  }, [sketchPath]);

  // Store refs to project actions so they're always current
  const reloadFileRef = useRef(reloadFile);
  const refreshFileTreeRef = useRef(refreshFileTree);
  const pushEditRef = useRef(pushEdit);
  useEffect(() => {
    reloadFileRef.current = reloadFile;
    refreshFileTreeRef.current = refreshFileTree;
    pushEditRef.current = pushEdit;
  }, [reloadFile, refreshFileTree, pushEdit]);

  // Ref to store addToolOutput once available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addToolOutputRef = useRef<any>(null);

  // Tool handlers that use refs to always access latest values
  const handleEditFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (toolCall: any) => {
      const addToolOutput = addToolOutputRef.current;
      if (!addToolOutput) {
        console.error("addToolOutput not available");
        return;
      }

      const { filePath: rawFilePath, oldContent, newContent, description } = toolCall.input as {
        filePath: string;
        oldContent: string;
        newContent: string;
        description: string;
      };

      // Convert relative path to absolute if needed
      const currentSketchPath = sketchPathRef.current;
      const filePath = currentSketchPath 
        ? toAbsolutePath(rawFilePath, currentSketchPath) 
        : rawFilePath;

      try {
        const client = getDaemonClient();
        const currentFile = await client.readFile(filePath);
        const currentContent = currentFile.content;

        if (!currentContent.includes(oldContent)) {
          addToolOutput({
            tool: "editFile",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: `Could not find the specified content to replace in ${filePath}. The file may have changed or the content doesn't match exactly.`,
          });
          return;
        }

        const updatedContent = currentContent.replace(oldContent, newContent);

        // Store for undo
        const editId = pushEditRef.current({
          filePath,
          previousContent: currentContent,
          newContent: updatedContent,
          description,
        });

        // Write the file
        await client.writeFile(filePath, updatedContent);

        // Reload in editor
        await reloadFileRef.current(filePath);

        // Refresh file tree
        await refreshFileTreeRef.current();

        addToolOutput({
          tool: "editFile",
          toolCallId: toolCall.toolCallId,
          output: {
            success: true,
            filePath,
            editId,
            description,
          },
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
    },
    [] // No dependencies - uses refs
  );

  const handleReadFile = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (toolCall: any) => {
      const addToolOutput = addToolOutputRef.current;
      if (!addToolOutput) {
        console.error("addToolOutput not available");
        return;
      }

      const { filePath: rawFilePath } = toolCall.input as { filePath: string };

      // Convert relative path to absolute if needed
      const currentSketchPath = sketchPathRef.current;
      const filePath = currentSketchPath 
        ? toAbsolutePath(rawFilePath, currentSketchPath) 
        : rawFilePath;

      try {
        const client = getDaemonClient();
        const result = await client.readFile(filePath);

        addToolOutput({
          tool: "readFile",
          toolCallId: toolCall.toolCallId,
          output: {
            filePath: rawFilePath, // Return the path as the model sent it
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
    },
    [] // No dependencies - uses refs
  );

  const handleListFiles = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (toolCall: any) => {
      console.log("[handleListFiles] Starting, toolCallId:", toolCall.toolCallId);
      const addToolOutput = addToolOutputRef.current;
      if (!addToolOutput) {
        console.error("[handleListFiles] addToolOutput not available!");
        return;
      }
      console.log("[handleListFiles] addToolOutput is available");

      const { path: rawPath } = toolCall.input as { path: string };
      console.log("[handleListFiles] Raw path:", rawPath);

      // Convert relative path to absolute if needed
      const currentSketchPath = sketchPathRef.current;
      const absolutePath = currentSketchPath 
        ? toAbsolutePath(rawPath, currentSketchPath) 
        : rawPath;

      try {
        const client = getDaemonClient();
        console.log("[handleListFiles] Calling listDirectory:", absolutePath);
        const files = await client.listDirectory(absolutePath);
        const fileList = formatFileTree(files);
        console.log("[handleListFiles] Got files, calling addToolOutput");

        addToolOutput({
          tool: "listFiles",
          toolCallId: toolCall.toolCallId,
          output: fileList,
        });
        console.log("[handleListFiles] addToolOutput called successfully");
      } catch (error) {
        console.error("[handleListFiles] Failed:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        addToolOutput({
          tool: "listFiles",
          toolCallId: toolCall.toolCallId,
          state: "output-error",
          errorText: `Could not list files: ${message}`,
        });
      }
    },
    [] // No dependencies - uses refs
  );

  // Store handlers in refs so onToolCall always has latest versions
  const handleEditFileRef = useRef(handleEditFile);
  const handleReadFileRef = useRef(handleReadFile);
  const handleListFilesRef = useRef(handleListFiles);
  useEffect(() => {
    handleEditFileRef.current = handleEditFile;
    handleReadFileRef.current = handleReadFile;
    handleListFilesRef.current = handleListFiles;
  }, [handleEditFile, handleReadFile, handleListFiles]);

  const { messages, sendMessage, addToolOutput, status, setMessages } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async onToolCall({ toolCall }: { toolCall: any }) {
      console.log("[onToolCall] Called with state:", toolCall.state, "name:", toolCall.toolName, "input:", toolCall.input);
      
      // Type guard for dynamic tools
      if ("dynamic" in toolCall && toolCall.dynamic) {
        return;
      }

      // Only process when input is available (state should be "call" or similar)
      // Skip partial/streaming states
      if (!toolCall.input) {
        console.log("[onToolCall] Waiting for input...");
        return;
      }

      const toolName = toolCall.toolName;
      console.log("[onToolCall] Processing tool call:", toolName, toolCall.toolCallId, toolCall.args);

      try {
        if (toolName === "editFile") {
          await handleEditFileRef.current(toolCall);
        } else if (toolName === "readFile") {
          await handleReadFileRef.current(toolCall);
        } else if (toolName === "listFiles") {
          await handleListFilesRef.current(toolCall);
        }
        console.log("[onToolCall] Tool call completed:", toolName);
      } catch (error) {
        console.error("[onToolCall] Tool call failed:", toolName, error);
      }
    },
  });

  // Use useLayoutEffect to set ref synchronously before any async callbacks
  useLayoutEffect(() => {
    addToolOutputRef.current = addToolOutput;
  }, [addToolOutput]);

  const isLoading = status === "streaming" || status === "submitted";

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      const scrollArea = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollArea) {
        scrollArea.scrollTop = scrollArea.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() && mentionedFiles.length === 0) return;

      // Load latest file contents before sending
      const client = getDaemonClient();
      const contents: Record<string, string> = {};
      for (const file of mentionedFiles) {
        try {
          const result = await client.readFile(file.path);
          // Use relative paths for the AI context
          const relativePath = sketchPath 
            ? toRelativePath(file.path, sketchPath) 
            : file.path;
          contents[relativePath] = result.content;
        } catch (error) {
          console.error(`Failed to read ${file.path}:`, error);
        }
      }

      // Build message with file context info
      let messageText = text;
      if (mentionedFiles.length > 0) {
        const fileList = mentionedFiles.map((f) => `@${f.name}`).join(", ");
        if (!messageText.includes("@")) {
          messageText = `[Files: ${fileList}]\n\n${messageText}`;
        }
      }

      // Pass fileContents as request-level body option
      sendMessage(
        { parts: [{ type: "text", text: messageText }] },
        { body: { fileContents: contents } }
      );
    },
    [mentionedFiles, sendMessage, sketchPath]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setMentionedFiles([]);
  }, [setMessages]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">AI Assistant</span>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleClearChat}
          className="h-7 w-7"
          title="Clear chat"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-3 space-y-1">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Ask me about your Arduino code!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use @ to mention files for context
              </p>
              {sketchPath && (
                <p className="text-xs text-muted-foreground mt-3 font-mono bg-muted px-2 py-1 rounded inline-block">
                  {sketchPath.split("/").pop()}
                </p>
              )}
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage key={message.id} message={message} />
            ))
          )}

          {isLoading && messages.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Thinking...</span>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <ChatInput
        mentionedFiles={mentionedFiles}
        onMentionedFilesChange={setMentionedFiles}
        onSend={handleSend}
        disabled={isLoading}
        fileTree={fileTree}
      />
    </div>
  );
}
