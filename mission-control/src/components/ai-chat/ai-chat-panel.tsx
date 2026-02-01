"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Trash2, Loader2, Trophy } from "lucide-react";
import { useChat } from "@ai-sdk/react";
import { lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChatMessage } from "./chat-message";
import { ChatInput } from "./chat-input";
import { type MentionedFile } from "./file-mention-popover";
import { useProjectStore } from "@/lib/project-state";
import { useAIChatStore } from "@/lib/ai-chat-state";
import { getDaemonClient } from "@/lib/daemon-client";
import { toRelativePath } from "./path-utils";
import { useToolHandlers } from "./use-tool-handlers";
import { ToolCall } from "./types";
import { Shimmer } from "@/components/ai-elements/shimmer";

export function AIChatPanel() {
  const fileTree = useProjectStore((s) => s.fileTree);
  const sketchPath = useProjectStore((s) => s.sketchPath);
  const reloadFile = useProjectStore((s) => s.reloadFile);
  const refreshFileTree = useProjectStore((s) => s.refreshFileTree);
  const pushEdit = useAIChatStore((s) => s.pushEdit);
  const competitionMode = useAIChatStore((s) => s.competitionMode);
  const toggleCompetitionMode = useAIChatStore((s) => s.toggleCompetitionMode);

  const [mentionedFiles, setMentionedFiles] = useState<MentionedFile[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handleToolCallRef = useRef<((toolCall: ToolCall) => Promise<void>) | null>(null);

  const { messages, sendMessage, addToolOutput, status, setMessages, stop } = useChat({
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    async onToolCall({ toolCall }) {
      if (handleToolCallRef.current) {
        await handleToolCallRef.current(toolCall as ToolCall);
      }
    },
  });

  const { handleToolCall } = useToolHandlers({
    sketchPath,
    reloadFile,
    refreshFileTree,
    pushEdit,
    // @ts-expect-error - idk
    addToolOutput,
  });

  useEffect(() => {
    handleToolCallRef.current = handleToolCall;
  }, [handleToolCall]);

  const isLoading = status === "streaming" || status === "submitted";

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

      const client = getDaemonClient();
      const contents: Record<string, string> = {};
      for (const file of mentionedFiles) {
        try {
          const result = await client.readFile(file.path);
          const relativePath = sketchPath 
            ? toRelativePath(file.path, sketchPath) 
            : file.path;
          contents[relativePath] = result.content;
        } catch (error) {
          console.error(`Failed to read ${file.path}:`, error);
        }
      }

      let messageText = text;
      if (mentionedFiles.length > 0) {
        const fileList = mentionedFiles.map((f) => `@${f.name}`).join(", ");
        if (!messageText.includes("@")) {
          messageText = `[Files: ${fileList}]\n\n${messageText}`;
        }
      }

      sendMessage(
        { parts: [{ type: "text", text: messageText }] },
        { body: { fileContents: contents, competitionMode } }
      );
    },
    [mentionedFiles, sendMessage, sketchPath, competitionMode]
  );

  const handleClearChat = useCallback(() => {
    setMessages([]);
    setMentionedFiles([]);
  }, [setMessages]);

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between px-3 py-2 border-b shrink-0">
        <span className="text-sm font-medium">Gemini</span>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={competitionMode ? "default" : "ghost"}
                size="icon"
                onClick={toggleCompetitionMode}
                className="h-7 w-7"
              >
                <Trophy className={`h-4 w-4 ${competitionMode ? "" : "text-muted-foreground"}`} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              <p className="font-medium">{competitionMode ? "Competition Mode ON" : "Competition Mode OFF"}</p>
              <p className="text-xs text-muted-foreground">
                {competitionMode 
                  ? "AI is optimizing for competition performance" 
                  : "AI is in general assistant mode"}
              </p>
            </TooltipContent>
          </Tooltip>
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
      </div>

      <ScrollArea className="flex-1 min-h-0" ref={scrollRef}>
        <div className="p-3 space-y-1">
          {messages.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">
                Ask me anythingx!
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Use @ to mention files for context
              </p>
              {/* {sketchPath && (
                <p className="text-xs text-muted-foreground mt-3 font-mono bg-muted px-2 py-1 rounded inline-block">
                  {sketchPath.split("/").pop()}
                </p>
              )} */}
            </div>
          ) : (
            messages.map((message, index) => (
              <ChatMessage 
                key={message.id} 
                message={message} 
                isStreaming={isLoading && index === messages.length - 1 && message.role === "assistant"}
              />
            ))
          )}

          {isLoading && messages.length > 0 && messages[messages.length - 1]?.role !== "assistant" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <Shimmer duration={1.5}>Thinking...</Shimmer>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0">
        <ChatInput
          mentionedFiles={mentionedFiles}
          onMentionedFilesChange={setMentionedFiles}
          onSend={handleSend}
          disabled={isLoading}
          stop={stop}
          fileTree={fileTree}
        />
      </div>
    </div>
  );
}
