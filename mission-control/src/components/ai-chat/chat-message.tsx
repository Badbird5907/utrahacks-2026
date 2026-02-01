"use client";

import { memo } from "react";
import { FileText, FolderOpen, Pencil, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffView } from "./diff-view";
import type { UIMessage } from "ai";

// Simple markdown-ish rendering for code blocks
function renderTextContent(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // Match code blocks ```...```
  const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/g;
  let match;
  
  while ((match = codeBlockRegex.exec(text)) !== null) {
    // Add text before code block
    if (match.index > lastIndex) {
      parts.push(
        <span key={`text-${lastIndex}`}>
          {renderInlineCode(text.slice(lastIndex, match.index))}
        </span>
      );
    }
    
    // Add code block
    const language = match[1] || "";
    const code = match[2].trim();
    parts.push(
      <pre
        key={`code-${match.index}`}
        className="my-2 p-2 rounded-md bg-muted text-xs font-mono overflow-x-auto"
      >
        {language && (
          <div className="text-[10px] text-muted-foreground mb-1 uppercase">
            {language}
          </div>
        )}
        <code>{code}</code>
      </pre>
    );
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(
      <span key={`text-${lastIndex}`}>
        {renderInlineCode(text.slice(lastIndex))}
      </span>
    );
  }
  
  return parts.length > 0 ? parts : text;
}

// Render inline code with backticks
function renderInlineCode(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const inlineCodeRegex = /`([^`]+)`/g;
  let lastIndex = 0;
  let match;
  
  while ((match = inlineCodeRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <code
        key={`inline-${match.index}`}
        className="px-1 py-0.5 rounded bg-muted text-xs font-mono"
      >
        {match[1]}
      </code>
    );
    lastIndex = match.index + match[0].length;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return parts.length > 0 ? parts : text;
}

// Type for tool parts - these have state, input, and output properties
interface ToolPartLike {
  state?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output?: any;
  errorText?: string;
}

interface ToolPartProps {
  part: ToolPartLike;
}

function EditToolPart({ part }: ToolPartProps) {
  const filename = part.input?.filePath?.split("/").pop() || "file";

  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Editing {filename}...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to edit {filename}: {part.errorText}
      </div>
    );
  }

  // output-available
  if (part.output && part.input) {
    return (
      <div className="my-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
          <Pencil className="h-3 w-3" />
          Edited <code className="bg-muted px-1 rounded">{filename}</code>
        </div>
        <DiffView
          oldContent={part.input.oldContent}
          newContent={part.input.newContent}
          filePath={part.input.filePath}
          editId={part.output.editId}
        />
      </div>
    );
  }

  return null;
}

function ReadToolPart({ part }: ToolPartProps) {
  const filename = part.input?.filePath?.split("/").pop() || "file";

  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Reading {filename}...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to read {filename}
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
      <FileText className="h-3 w-3" />
      Read <code className="bg-muted px-1 rounded">{filename}</code>
    </div>
  );
}

function ListFilesToolPart({ part }: ToolPartProps) {
  const dir = part.input?.path?.split("/").pop() || part.input?.path || "directory";

  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Listing files...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to list files
      </div>
    );
  }

  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
      <FolderOpen className="h-3 w-3" />
      Listed files in <code className="bg-muted px-1 rounded">{dir}</code>
    </div>
  );
}

interface ChatMessageProps {
  message: UIMessage;
}

export const ChatMessage = memo(function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "py-2",
        isUser && "flex justify-end"
      )}
    >
      <div
        className={cn(
          "max-w-[90%] text-sm",
          isUser && "bg-muted rounded-2xl px-3 py-2"
        )}
      >
        {message.parts.map((part, index) => {
          const key = `${message.id}-part-${index}`;
          const partType = part.type;

          // Handle text parts
          if (partType === "text") {
            const textPart = part as { type: "text"; text: string };
            if (!textPart.text) return null;
            return (
              <div key={key} className="whitespace-pre-wrap break-words">
                {renderTextContent(textPart.text)}
              </div>
            );
          }

          // Handle tool parts - they start with "tool-"
          if (partType.startsWith("tool-")) {
            const toolName = partType.slice(5); // Remove "tool-" prefix
            const toolPart = part as unknown as ToolPartLike;

            if (toolName === "editFile") {
              return <EditToolPart key={key} part={toolPart} />;
            }
            if (toolName === "readFile") {
              return <ReadToolPart key={key} part={toolPart} />;
            }
            if (toolName === "listFiles") {
              return <ListFilesToolPart key={key} part={toolPart} />;
            }

            // Unknown tool - skip
            return null;
          }

          // Skip other part types (step-start, etc.)
          return null;
        })}
      </div>
    </div>
  );
});
