"use client";

import { memo } from "react";
import { FileText, FolderOpen, Pencil, AlertCircle, Loader2, CheckCircle, Upload, Terminal, TrendingUp, Database } from "lucide-react";
import { cn } from "@/lib/utils";
import { DiffView } from "./diff-view";
import { useAIChatStore } from "@/lib/ai-chat-state";
import type { UIMessage } from "ai";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { mermaid } from "@streamdown/mermaid";
import { math } from "@streamdown/math";
import { cjk } from "@streamdown/cjk";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";

import "katex/dist/katex.min.css";

const MonacoCodeBlock = ({ children, className }: { children: string; className?: string }) => {
  const { theme } = useTheme();
  const language = className?.replace('language-', '') || 'text';
  const languageMap: Record<string, string> = {
    'js': 'javascript',
    'ts': 'typescript',
    'py': 'python',
    'cpp': 'cpp',
    'c': 'c',
    'arduino': 'cpp',
    'ino': 'cpp',
    'jsx': 'javascript',
    'tsx': 'typescript',
    'json': 'json',
    'html': 'html',
    'css': 'css',
    'sh': 'shell',
    'bash': 'shell',
    'yaml': 'yaml',
    'yml': 'yaml',
    'md': 'markdown',
    'txt': 'text',
  };
  
  const monacoLanguage = languageMap[language] || language;
  const code = String(children).replace(/\n$/, '');
  const lineCount = code.split('\n').length;
  const lineHeight = 19;
  const padding = 16;
  const minHeight = 60;
  const maxHeight = 400;
  const calculatedHeight = Math.min(Math.max(lineCount * lineHeight + padding, minHeight), maxHeight);
  
  return (
    <div className="my-3 rounded-lg border border-border overflow-hidden bg-muted/30">
      {language !== 'text' && (
        <div className="px-3 py-1.5 text-[10px] font-medium text-muted-foreground uppercase border-b border-border/50 bg-muted/20">
          {language}
        </div>
      )}
      <div style={{ height: `${calculatedHeight}px` }}>
        <Editor
          value={code}
          language={monacoLanguage}
          theme={theme === "dark" ? "vs-dark" : "vs"}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            scrollBeyondLastLine: false,
            lineNumbers: 'off',
            glyphMargin: false,
            folding: false,
            lineDecorationsWidth: 0,
            lineNumbersMinChars: 0,
            renderLineHighlight: 'none',
            scrollbar: {
              vertical: lineCount * lineHeight > maxHeight ? 'visible' : 'hidden',
              horizontal: 'auto',
              verticalScrollbarSize: 10,
              horizontalScrollbarSize: 10,
            },
            overviewRulerLanes: 0,
            hideCursorInOverviewRuler: true,
            overviewRulerBorder: false,
            wordWrap: 'on',
            wrappingStrategy: 'advanced',
            fontSize: 13,
            fontFamily: 'var(--font-geist-mono), Monaco, Menlo, "Courier New", monospace',
            padding: { top: 8, bottom: 8 },
            contextmenu: false,
            selectOnLineNumbers: false,
            selectionHighlight: false,
            occurrencesHighlight: 'off',
            renderWhitespace: 'none',
            guides: {
              indentation: false,
            },
            extraEditorClassName: "pl-2"
          }}
          loading={<div className="flex items-center justify-center h-full text-xs text-muted-foreground">Loading...</div>}
        />
      </div>
    </div>
  );
};

const StreamdownComponents = {
  pre: ({ children }: React.HTMLAttributes<HTMLPreElement>) => {
    return <>{children}</>;
  },
  code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement> & { className?: string }) => {
    const isCodeBlock = className?.startsWith('language-');
    if (isCodeBlock) {
      return <MonacoCodeBlock className={className}>{String(children)}</MonacoCodeBlock>;
    }
    return (
      <code
        {...props}
        className="px-1.5 py-0.5 rounded bg-muted/70 text-[0.9em] font-mono text-foreground border border-border/50"
      >
        {children}
      </code>
    );
  },
  p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p {...props} className="mb-2 last:mb-0 leading-relaxed">
      {children}
    </p>
  ),
  h1: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h1 {...props} className="text-2xl font-bold mt-4 mb-3 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h2 {...props} className="text-xl font-bold mt-4 mb-2 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
    <h3 {...props} className="text-lg font-semibold mt-3 mb-2 first:mt-0">
      {children}
    </h3>
  ),
  // Custom list styling
  ul: ({ children, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
    <ul {...props} className="list-disc list-inside mb-2 space-y-1">
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.HTMLAttributes<HTMLOListElement>) => (
    <ol {...props} className="list-decimal list-inside mb-2 space-y-1">
      {children}
    </ol>
  ),
  blockquote: ({ children, ...props }: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      {...props}
      className="border-l-4 border-primary/50 pl-4 my-2 italic text-muted-foreground"
    >
      {children}
    </blockquote>
  ),
};

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
  const getEdit = useAIChatStore((s) => s.getEdit);
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
    // Get the edit details from the store
    const edit = part.output.editId ? getEdit(part.output.editId) : undefined;
    
    if (!edit) {
      return (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
          <Pencil className="h-3 w-3" />
          Edited <code className="bg-muted px-1 rounded">{filename}</code>
        </div>
      );
    }

    return (
      <div className="my-1">
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1">
          <Pencil className="h-3 w-3" />
          Edited <code className="bg-muted px-1 rounded">{filename}</code>
        </div>
        <DiffView
          oldContent={edit.previousContent}
          newContent={edit.newContent}
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
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
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

function VerifySketchToolPart({ part }: ToolPartProps) {
  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Compiling sketch...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to verify sketch: {part.errorText}
      </div>
    );
  }

  // output-available
  const success = part.output?.success;
  const message = part.output?.message;

  if (success) {
    return (
      <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5 py-1">
        <CheckCircle className="h-3 w-3" />
        {message || "Sketch verified successfully"}
      </div>
    );
  }

  return (
    <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
      <AlertCircle className="h-3 w-3" />
      {message || "Sketch verification failed"}
    </div>
  );
}

function UploadSketchToolPart({ part }: ToolPartProps) {
  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Uploading sketch to Arduino...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to upload sketch: {part.errorText}
      </div>
    );
  }

  // output-available
  const success = part.output?.success;
  const message = part.output?.message;

  if (success) {
    return (
      <div className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1.5 py-1">
        <Upload className="h-3 w-3" />
        {message || "Sketch uploaded successfully"}
      </div>
    );
  }

  return (
    <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
      <AlertCircle className="h-3 w-3" />
      {message || "Sketch upload failed"}
    </div>
  );
}

function ReadSerialLogsToolPart({ part }: ToolPartProps) {
  const limit = part.input?.limit || 50;

  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Reading serial logs...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to read serial logs: {part.errorText}
      </div>
    );
  }

  // output-available
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
      <Terminal className="h-3 w-3" />
      Read {limit} serial log lines
    </div>
  );
}

function GetRunsToolPart({ part }: ToolPartProps) {
  const limit = part.input?.limit || 10;

  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Fetching competition runs...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Failed to fetch runs: {part.errorText}
      </div>
    );
  }

  // output-available
  const totalRuns = part.output?.totalRuns || 0;
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
      <TrendingUp className="h-3 w-3" />
      Analyzed {totalRuns} competition run{totalRuns !== 1 ? 's' : ''} (limit: {limit})
    </div>
  );
}

function QuerySnowflakeToolPart({ part }: ToolPartProps) {
  const explanation = part.input?.explanation;

  if (part.state === "partial-call" || part.state === "call" || part.state === "input-streaming" || part.state === "input-available") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        Querying analytics database...
      </div>
    );
  }

  if (part.state === "output-error") {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        Query failed: {part.errorText}
      </div>
    );
  }

  // output-available
  if (part.output?.success === false) {
    return (
      <div className="text-xs text-destructive flex items-center gap-1.5 py-1">
        <AlertCircle className="h-3 w-3" />
        {part.output.error || "Query failed"}
      </div>
    );
  }

  const rowCount = part.output?.rowCount || 0;
  const executionTime = part.output?.executionTimeMs;
  
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-1.5 py-1">
      <Database className="h-3 w-3" />
      {explanation || "Query executed"}: {rowCount} row{rowCount !== 1 ? 's' : ''}
      {executionTime && ` (${executionTime}ms)`}
    </div>
  );
}

interface ReasoningPartLike {
  text: string;
}

interface ReasoningPartProps {
  part: ReasoningPartLike;
  isStreaming: boolean;
}

function ReasoningPart({ part, isStreaming }: ReasoningPartProps) {
  if (!part.text) return null;

  return (
    <Reasoning isStreaming={isStreaming}>
      <ReasoningTrigger />
      <ReasoningContent>{part.text}</ReasoningContent>
    </Reasoning>
  );
}

interface ChatMessageProps {
  message: UIMessage;
  isStreaming?: boolean;
}

export const ChatMessage = memo(function ChatMessage({ message, isStreaming = false }: ChatMessageProps) {
  const isUser = message.role === "user";
  const shouldShowGenerating = isStreaming && message.role === "assistant" && (() => {
    const hasText = message.parts.some(p => p.type === "text" && (p as { text: string }).text?.trim());
    const hasReasoning = message.parts.some(p => p.type === "reasoning");
    const hasToolCalls = message.parts.some(p => p.type.startsWith("tool-"));
    const allToolsCompleted = message.parts
      .filter(p => p.type.startsWith("tool-"))
      .every(p => {
        const toolPart = p as unknown as ToolPartLike;
        return toolPart.state === "output-available" || toolPart.state === "output-error";
      });
    
    return hasToolCalls && allToolsCompleted && !hasText && !hasReasoning;
  })();

  return (
    <div
      className={cn(
        "py-2",
        isUser && "flex justify-end"
      )}
    >
      <div
        className={cn(
          "w-full text-sm",
          isUser && "bg-muted rounded-2xl px-3 py-2"
        )}
      >
        {message.parts.map((part, index) => {
          const key = `${message.id}-part-${index}`;
          const partType = part.type;
          if (partType === "reasoning") {
            const reasoningPart = part as unknown as ReasoningPartLike;
            return <ReasoningPart key={key} part={reasoningPart} isStreaming={isStreaming} />;
          }
          if (partType === "text") {
            const textPart = part as { type: "text"; text: string };
            if (!textPart.text) return null;
            return (
              <div key={key} className="whitespace-pre-wrap wrap-break-word">
                <Streamdown
                  plugins={{
                    code: code,
                    mermaid: mermaid,
                    math: math,
                    cjk: cjk,
                  }}
                  components={StreamdownComponents}
                  isAnimating={isStreaming}
                >
                  {textPart.text}
                </Streamdown>
              </div>
            );
          }
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
            if (toolName === "verifySketch") {
              return <VerifySketchToolPart key={key} part={toolPart} />;
            }
            if (toolName === "uploadSketch") {
              return <UploadSketchToolPart key={key} part={toolPart} />;
            }
            if (toolName === "readSerialLogs") {
              return <ReadSerialLogsToolPart key={key} part={toolPart} />;
            }
            if (toolName === "getRuns") {
              return <GetRunsToolPart key={key} part={toolPart} />;
            }
            if (toolName === "querySnowflake") {
              return <QuerySnowflakeToolPart key={key} part={toolPart} />;
            }
            return null;
          }
          return null;
        })}
        {shouldShowGenerating && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-1 mt-1">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span className="text-xs">Generating response...</span>
          </div>
        )}
      </div>
    </div>
  );
});
