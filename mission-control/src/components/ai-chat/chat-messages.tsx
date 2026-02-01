"use client";

import { useEffect, useRef } from "react";
import { type UIMessage } from "ai";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Bot, User, FileCode, CheckCircle2, Loader2, AlertCircle } from "lucide-react";

interface ChatMessagesProps {
  messages: UIMessage[];
  isLoading?: boolean;
}

export function ChatMessages({ messages, isLoading }: ChatMessagesProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 min-h-0">
        <div className="text-center max-w-sm">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Bot className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-base font-semibold text-foreground mb-2">
            Ready to assist
          </h3>
          <p className="text-sm text-muted-foreground mb-3">
            Ask me anything about your code, request changes, or get help with your project.
          </p>
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 bg-muted/50 px-3 py-1.5 rounded-full">
            <span className="font-mono">@</span>
            <span>Mention files for context</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="flex-1 min-h-0">
      <div className="p-4 space-y-4">
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {isLoading && (
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mt-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}

interface MessageBubbleProps {
  message: UIMessage;
}

function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center",
        isUser 
          ? "bg-primary text-primary-foreground" 
          : "bg-primary/10"
      )}>
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4 text-primary" />
        )}
      </div>

      {/* Content */}
      <div className={cn("flex flex-col gap-2 min-w-0 flex-1", isUser ? "items-end" : "items-start")}>
        {message.parts.map((part, index) => {
          if (part.type === "text") {
            return (
              <div
                key={index}
                className={cn(
                  "px-4 py-2.5 rounded-2xl text-sm max-w-[85%] shadow-sm",
                  isUser
                    ? "bg-primary text-primary-foreground rounded-tr-md"
                    : "bg-muted/60 text-foreground rounded-tl-md border border-border/50"
                )}
              >
                <MessageContent content={part.text} />
              </div>
            );
          }
          
          // Handle tool parts (tool-call, tool-result, etc.)
          if (part.type.startsWith("tool-")) {
            return (
              <ToolPartDisplay
                key={index}
                part={part}
              />
            );
          }
          
          return null;
        })}
      </div>
    </div>
  );
}

interface MessageContentProps {
  content: string;
}

function MessageContent({ content }: MessageContentProps) {
  // Simple markdown-like rendering for code blocks
  const parts = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="whitespace-pre-wrap break-words overflow-hidden leading-relaxed">
      {parts.map((part, index) => {
        if (part.startsWith("```")) {
          // Extract language and code
          const match = part.match(/```(\w+)?\n?([\s\S]*?)```/);
          if (match) {
            const [, lang, code] = match;
            return (
              <div key={index} className="my-3 -mx-1">
                <div className="rounded-lg overflow-hidden border border-border/50 bg-background/80">
                  {lang && (
                    <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground bg-muted/50 border-b border-border/50">
                      {lang}
                    </div>
                  )}
                  <pre className="p-3 overflow-x-auto text-xs font-mono">
                    <code className="break-all">{code.trim()}</code>
                  </pre>
                </div>
              </div>
            );
          }
        }
        // Render inline code
        const inlineParts = part.split(/(`[^`]+`)/g);
        return (
          <span key={index}>
            {inlineParts.map((inlinePart, i) => {
              if (inlinePart.startsWith("`") && inlinePart.endsWith("`")) {
                return (
                  <code
                    key={i}
                    className="bg-muted/60 px-1.5 py-0.5 rounded text-[0.85em] font-mono border border-border/30"
                  >
                    {inlinePart.slice(1, -1)}
                  </code>
                );
              }
              return <span key={i}>{inlinePart}</span>;
            })}
          </span>
        );
      })}
    </div>
  );
}

interface ToolPartDisplayProps {
  part: {
    type: string;
    toolCallId?: string;
    toolName?: string;
    input?: unknown;
    output?: unknown;
    state?: string;
    [key: string]: unknown;
  };
}

function ToolPartDisplay({ part }: ToolPartDisplayProps) {
  const toolName = part.toolName as string | undefined;
  const input = part.input as Record<string, unknown> | undefined;
  const state = part.state as string | undefined;

  if (toolName === "editFile" && input) {
    const filePath = input.filePath as string;
    const description = input.description as string;
    const fileName = filePath?.split("/").pop() || "file";

    const isComplete = state === "output" || state === "output-error";
    const isError = state === "output-error";

    return (
      <div className={cn(
        "flex items-center gap-2.5 px-3 py-2 rounded-xl border max-w-[85%] shadow-sm transition-all",
        isError 
          ? "bg-red-500/5 border-red-500/20 hover:bg-red-500/10" 
          : "bg-blue-500/5 border-blue-500/20 hover:bg-blue-500/10"
      )}>
        <div className={cn(
          "flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center",
          isError ? "bg-red-500/10" : "bg-blue-500/10"
        )}>
          <FileCode className={cn(
            "h-3.5 w-3.5",
            isError ? "text-red-500" : "text-blue-500"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className={cn(
            "font-medium text-xs truncate",
            isError ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"
          )}>
            {fileName}
          </div>
          {description && (
            <div className="text-[10px] text-muted-foreground truncate mt-0.5">
              {description}
            </div>
          )}
        </div>
        {!isComplete && (
          <Loader2 className="h-4 w-4 animate-spin text-blue-500 flex-shrink-0" />
        )}
        {isComplete && !isError && (
          <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
        )}
        {isComplete && isError && (
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
        )}
      </div>
    );
  }

  // Generic tool display
  return (
    <div className="px-3 py-2 rounded-xl bg-muted/40 border border-border/50 max-w-[85%] overflow-hidden shadow-sm">
      <div className="text-xs font-semibold text-foreground mb-1.5">
        Tool: {toolName || "unknown"}
      </div>
      {input && (
        <pre className="overflow-x-auto text-[10px] font-mono text-muted-foreground">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
    </div>
  );
}
