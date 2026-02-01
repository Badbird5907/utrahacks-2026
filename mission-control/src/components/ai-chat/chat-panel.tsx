"use client";

import { useCallback, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Button } from "@/components/ui/button";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { useAIChatStore } from "@/lib/ai-state";
import { useProjectStore } from "@/lib/project-state";
import { getDaemonClient } from "@/lib/daemon-client";
import { X, RotateCcw, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function ChatPanel() {
  const closePanel = useAIChatStore((s) => s.closePanel);
  const editHistory = useAIChatStore((s) => s.editHistory);
  const pushEdit = useAIChatStore((s) => s.pushEdit);
  const undoLastEdit = useAIChatStore((s) => s.undoLastEdit);
  const clearMentions = useAIChatStore((s) => s.clearMentions);
  
  const refreshFileTree = useProjectStore((s) => s.refreshFileTree);
  const reloadFile = useProjectStore((s) => s.reloadFile);

  const {
    messages,
    setMessages,
    sendMessage,
    status,
    error,
    addToolOutput,
  } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/chat",
    }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    // Handle tool calls on the client side
    async onToolCall({ toolCall }) {
      // Check if it's a dynamic tool first for proper type narrowing
      if (toolCall.dynamic) {
        return;
      }

      if (toolCall.toolName === "editFile") {
        const { filePath, oldContent, newContent, description } = toolCall.input as {
          filePath: string;
          oldContent: string;
          newContent: string;
          description: string;
        };

        try {
          // Get current file content
          const client = getDaemonClient();
          const currentFile = await client.readFile(filePath);
          const currentContent = currentFile.content;

          // Check if oldContent exists in the file
          if (!currentContent.includes(oldContent)) {
            // Important: Don't await inside onToolCall to avoid deadlocks
            addToolOutput({
              tool: "editFile",
              toolCallId: toolCall.toolCallId,
              state: "output-error",
              errorText: `Could not find the specified content to replace in ${filePath}. The file may have changed or the content doesn't match exactly.`,
            });
            return;
          }

          // Store previous content for undo
          pushEdit({
            filePath,
            previousContent: currentContent,
            newContent: currentContent.replace(oldContent, newContent),
            description,
          });

          // Perform the replacement
          const updatedContent = currentContent.replace(oldContent, newContent);

          // Write the file
          await client.writeFile(filePath, updatedContent);
          console.log('[AI Chat] File written, reloading in editor:', filePath);

          // Reload the file in the editor if it's open
          await reloadFile(filePath);
          console.log('[AI Chat] File reloaded');

          // Refresh file tree
          await refreshFileTree();

          toast.success(`File edited: ${filePath.split("/").pop()}`, {
            description: description,
            action: {
              label: "Undo",
              onClick: async () => {
                const success = await undoLastEdit();
                if (success) {
                  toast.success("Edit undone");
                  // Reload the file in editor
                  await reloadFile(filePath);
                }
              },
            },
          });

          // Important: Don't await inside onToolCall to avoid deadlocks
          addToolOutput({
            tool: "editFile",
            toolCallId: toolCall.toolCallId,
            output: `Successfully edited ${filePath}: ${description}`,
          });
        } catch (error) {
          console.error("Failed to edit file:", error);
          const message = error instanceof Error ? error.message : "Unknown error";
          // Important: Don't await inside onToolCall to avoid deadlocks
          addToolOutput({
            tool: "editFile",
            toolCallId: toolCall.toolCallId,
            state: "output-error",
            errorText: `Error editing file: ${message}`,
          });
        }
      } else if (toolCall.toolName === "listFiles") {
        const { path } = toolCall.input as {
          path: string;
        };
        const client = getDaemonClient();
        const files = await client.listDirectory(path);
        addToolOutput({
          tool: "listFiles",
          toolCallId: toolCall.toolCallId,
          output: files,
        });
      }
    },
  });

  // Show error toast
  useEffect(() => {
    if (error) {
      toast.error("Chat error", { description: error.message });
    }
  }, [error]);

  // Handle message submission with file context
  const handleSubmit = useCallback(
    async (message: string, fileContents: Record<string, string>) => {
      await sendMessage(
        { text: message },
        {
          body: { fileContents },
        }
      );
    },
    [sendMessage]
  );

  // Handle undo
  const handleUndo = useCallback(async () => {
    const success = await undoLastEdit();
    if (success) {
      toast.success("Edit undone");
      // Refresh to update editor
      await refreshFileTree();
    } else {
      toast.error("Failed to undo");
    }
  }, [undoLastEdit, refreshFileTree]);

  // Clear chat
  const handleClearChat = useCallback(() => {
    setMessages([]);
    clearMentions();
  }, [setMessages, clearMentions]);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-background via-background to-background/95 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 backdrop-blur-sm bg-background/80 flex-shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="relative">
            <Sparkles className="h-4.5 w-4.5 text-primary animate-pulse-subtle" />
            <div className="absolute inset-0 h-4.5 w-4.5 text-primary/20 animate-ping-slow" />
          </div>
          <div>
            <h2 className="font-semibold text-sm text-foreground">Gemini</h2>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {editHistory.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              title={`Undo last edit (${editHistory.length} ${editHistory.length === 1 ? 'edit' : 'edits'})`}
              className="h-8 px-2.5 hover:bg-muted/80 transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
              <span className="text-xs font-medium">{editHistory.length}</span>
            </Button>
          )}
          {messages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearChat}
              title="Clear conversation"
              className="h-8 w-8 p-0 hover:bg-muted/80 hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={closePanel}
            title="Close AI chat"
            className="h-8 w-8 p-0 hover:bg-muted/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ChatMessages messages={messages} isLoading={status === 'streaming'} />

      {/* Input */}
      <ChatInput onSubmit={handleSubmit} isLoading={status === 'streaming'} />
    </div>
  );
}
