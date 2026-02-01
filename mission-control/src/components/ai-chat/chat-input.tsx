"use client";

import { useState, useRef, useCallback, useEffect, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import { FileEntry } from "@/lib/daemon-client";
import { MentionedFile, useAIChatStore } from "@/lib/ai-state";
import { useProjectStore } from "@/lib/project-state";
import { getDaemonClient } from "@/lib/daemon-client";
import { FileMentionPicker, MentionedFileChip } from "./file-mention";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  onSubmit: (message: string, fileContents: Record<string, string>) => void;
  isLoading?: boolean;
  disabled?: boolean;
}

export function ChatInput({ onSubmit, isLoading, disabled }: ChatInputProps) {
  const [input, setInput] = useState("");
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionPosition, setMentionPosition] = useState({ top: 0, left: 0 });
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fileTree = useProjectStore((s) => s.fileTree);
  const mentionedFiles = useAIChatStore((s) => s.mentionedFiles);
  const addMentionedFile = useAIChatStore((s) => s.addMentionedFile);
  const removeMentionedFile = useAIChatStore((s) => s.removeMentionedFile);
  const getMentionedFileContents = useAIChatStore((s) => s.getMentionedFileContents);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  // Detect @ mentions
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const value = e.target.value;
      setInput(value);

      // Check for @ mention
      const cursorPosition = e.target.selectionStart;
      const textBeforeCursor = value.slice(0, cursorPosition);
      const atMatch = textBeforeCursor.match(/@(\w*)$/);

      if (atMatch) {
        setMentionQuery(atMatch[1]);
        setShowMentionPicker(true);
        setMentionPosition({
          top: -180,
          left: 0,
        });
      } else {
        setShowMentionPicker(false);
        setMentionQuery("");
      }
    },
    []
  );

  // Handle file selection from picker
  const handleFileSelect = useCallback(
    async (file: FileEntry) => {
      try {
        // Fetch file content
        const client = getDaemonClient();
        const result = await client.readFile(file.path);

        const mentionedFile: MentionedFile = {
          path: file.path,
          name: file.name,
          content: result.content,
        };

        addMentionedFile(mentionedFile);

        // Remove the @query from input
        const cursorPosition = textareaRef.current?.selectionStart || 0;
        const textBeforeCursor = input.slice(0, cursorPosition);
        const textAfterCursor = input.slice(cursorPosition);
        const newTextBeforeCursor = textBeforeCursor.replace(/@\w*$/, "");
        setInput(newTextBeforeCursor + textAfterCursor);

        setShowMentionPicker(false);
        setMentionQuery("");

        // Focus back on textarea
        textareaRef.current?.focus();
      } catch (error) {
        console.error("Failed to load file:", error);
      }
    },
    [input, addMentionedFile]
  );

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isLoading || disabled) return;

    const fileContents = getMentionedFileContents();
    onSubmit(trimmedInput, fileContents);
    setInput("");
    
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [input, isLoading, disabled, getMentionedFileContents, onSubmit]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      // Submit on Enter (without Shift)
      if (e.key === "Enter" && !e.shiftKey && !showMentionPicker) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit, showMentionPicker]
  );

  return (
    <div className="border-t border-border p-2 flex-shrink-0">
      {/* Mentioned files chips */}
      {mentionedFiles.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2 overflow-hidden">
          {mentionedFiles.map((file) => (
            <MentionedFileChip
              key={file.path}
              name={file.name}
              path={file.path}
              onRemove={() => removeMentionedFile(file.path)}
            />
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="relative">
        {/* File mention picker */}
        {showMentionPicker && (
          <FileMentionPicker
            fileTree={fileTree}
            searchQuery={mentionQuery}
            onSelect={handleFileSelect}
            onClose={() => setShowMentionPicker(false)}
            position={mentionPosition}
          />
        )}

        <div className="flex items-end gap-1.5">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Message... (@file)"
            disabled={disabled || isLoading}
            rows={1}
            className={cn(
              "flex-1 min-w-0 resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-sm",
              "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1",
              "focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
              "min-h-[36px] max-h-[120px]"
            )}
          />

          <Button
            size="icon"
            onClick={handleSubmit}
            disabled={!input.trim() || isLoading || disabled}
            className="flex-shrink-0 h-9 w-9"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
