"use client";

import { useState, useRef, useCallback, KeyboardEvent } from "react";
import { Send, X, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  FileMentionPopover,
  type MentionedFile,
} from "./file-mention-popover";
import type { FileEntry } from "@/lib/daemon-client";

interface ChatInputProps {
  mentionedFiles: MentionedFile[];
  onMentionedFilesChange: (files: MentionedFile[]) => void;
  onSend: (message: string) => void;
  disabled?: boolean;
  fileTree: FileEntry[] | null;
}

export function ChatInput({
  mentionedFiles,
  onMentionedFilesChange,
  onSend,
  disabled = false,
  fileTree,
}: ChatInputProps) {
  const [inputValue, setInputValue] = useState("");
  const [showMentionPopover, setShowMentionPopover] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartPos, setMentionStartPos] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart;
    setInputValue(value);

    // Check for @ mention trigger
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      // Check if @ is at start or preceded by whitespace
      const charBeforeAt = lastAtIndex > 0 ? value[lastAtIndex - 1] : " ";
      if (charBeforeAt === " " || charBeforeAt === "\n" || lastAtIndex === 0) {
        const query = textBeforeCursor.slice(lastAtIndex + 1);
        // Only show popover if there's no space after @
        if (!query.includes(" ") && !query.includes("\n")) {
          setMentionQuery(query);
          setMentionStartPos(lastAtIndex);
          setShowMentionPopover(true);
          return;
        }
      }
    }

    setShowMentionPopover(false);
    setMentionQuery("");
    setMentionStartPos(null);
  };

  const handleFileSelect = useCallback(
    (file: MentionedFile) => {
      // Check if already mentioned
      if (mentionedFiles.some((f) => f.path === file.path)) {
        // Just close popover and remove the @query
        if (mentionStartPos !== null) {
          const before = inputValue.slice(0, mentionStartPos);
          const after = inputValue.slice(
            mentionStartPos + mentionQuery.length + 1
          );
          setInputValue(before + after);
        }
        setShowMentionPopover(false);
        setMentionQuery("");
        setMentionStartPos(null);
        textareaRef.current?.focus();
        return;
      }

      // Add file to mentions
      onMentionedFilesChange([...mentionedFiles, file]);

      // Remove @query from input
      if (mentionStartPos !== null) {
        const before = inputValue.slice(0, mentionStartPos);
        const after = inputValue.slice(
          mentionStartPos + mentionQuery.length + 1
        );
        setInputValue(before + after);
      }

      setShowMentionPopover(false);
      setMentionQuery("");
      setMentionStartPos(null);
      textareaRef.current?.focus();
    },
    [
      inputValue,
      mentionQuery,
      mentionStartPos,
      mentionedFiles,
      onMentionedFilesChange,
    ]
  );

  const handleRemoveFile = useCallback(
    (path: string) => {
      onMentionedFilesChange(mentionedFiles.filter((f) => f.path !== path));
    },
    [mentionedFiles, onMentionedFilesChange]
  );

  const handleSend = useCallback(() => {
    const trimmedMessage = inputValue.trim();
    if (!trimmedMessage && mentionedFiles.length === 0) return;

    onSend(trimmedMessage);
    setInputValue("");
    // Don't clear mentioned files - they persist for context
  }, [inputValue, mentionedFiles.length, onSend]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't handle if mention popover is open (it handles its own keys)
    if (showMentionPopover) {
      if (
        e.key === "ArrowUp" ||
        e.key === "ArrowDown" ||
        e.key === "Enter" ||
        e.key === "Escape"
      ) {
        // Let the popover handle these
        return;
      }
    }

    // Ctrl+Enter or Cmd+Enter to send
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSend();
      return;
    }

    // Plain Enter to send (if not shift+enter for newline)
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
  };

  const handleCloseMentionPopover = useCallback(() => {
    setShowMentionPopover(false);
    setMentionQuery("");
    setMentionStartPos(null);
  }, []);

  return (
    <div className="flex flex-col gap-2 p-3 border-t bg-background">
      {/* File chips */}
      {mentionedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {mentionedFiles.map((file) => (
            <Badge
              key={file.path}
              variant="secondary"
              className="gap-1 text-xs pl-1.5 pr-1 py-0.5"
            >
              <FileText className="h-3 w-3" />
              <span className="max-w-32 truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => handleRemoveFile(file.path)}
                className="ml-0.5 rounded-sm hover:bg-muted-foreground/20 p-0.5"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <textarea
            ref={textareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your code..."
            disabled={disabled}
            rows={1}
            className={cn(
              "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "min-h-[38px] max-h-32"
            )}
            style={{
              height: "auto",
              minHeight: "38px",
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = "auto";
              target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
            }}
          />

          {/* Mention popover */}
          {showMentionPopover && (
            <FileMentionPopover
              query={mentionQuery}
              fileTree={fileTree}
              onSelect={handleFileSelect}
              onClose={handleCloseMentionPopover}
            />
          )}
        </div>

        <Button
          size="icon"
          onClick={handleSend}
          disabled={disabled || (!inputValue.trim() && mentionedFiles.length === 0)}
          className="shrink-0"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>

      {/* Keyboard hint */}
      <p className="text-[10px] text-muted-foreground">
        Enter to send, Shift+Enter for newline
      </p>
    </div>
  );
}
