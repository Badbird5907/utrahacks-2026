"use client";

import { useMemo, useState } from "react";
import { diffLines, type Change } from "diff";
import { Undo2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAIChatStore } from "@/lib/ai-chat-state";
import { toast } from "sonner";

interface DiffViewProps {
  oldContent: string;
  newContent: string;
  filePath: string;
  editId: string;
}

interface DiffLine {
  type: "add" | "remove" | "unchanged";
  text: string;
}

function generateDiffLines(oldContent: string, newContent: string): DiffLine[] {
  const changes: Change[] = diffLines(oldContent, newContent);
  const lines: DiffLine[] = [];

  for (const change of changes) {
    const changeLines = change.value.split("\n");
    // Remove last empty string from split if the value ends with \n
    if (changeLines[changeLines.length - 1] === "") {
      changeLines.pop();
    }

    for (const line of changeLines) {
      if (change.added) {
        lines.push({ type: "add", text: line });
      } else if (change.removed) {
        lines.push({ type: "remove", text: line });
      } else {
        lines.push({ type: "unchanged", text: line });
      }
    }
  }

  return lines;
}

// Collapse unchanged lines if there are many
function collapseDiffLines(
  lines: DiffLine[],
  contextLines: number = 3
): (DiffLine | { type: "collapsed"; count: number })[] {
  const result: (DiffLine | { type: "collapsed"; count: number })[] = [];
  let unchangedBuffer: DiffLine[] = [];

  const flushUnchanged = () => {
    if (unchangedBuffer.length <= contextLines * 2) {
      result.push(...unchangedBuffer);
    } else {
      // Show first contextLines, collapse middle, show last contextLines
      result.push(...unchangedBuffer.slice(0, contextLines));
      result.push({
        type: "collapsed",
        count: unchangedBuffer.length - contextLines * 2,
      });
      result.push(...unchangedBuffer.slice(-contextLines));
    }
    unchangedBuffer = [];
  };

  for (const line of lines) {
    if (line.type === "unchanged") {
      unchangedBuffer.push(line);
    } else {
      if (unchangedBuffer.length > 0) {
        flushUnchanged();
      }
      result.push(line);
    }
  }

  // Flush remaining unchanged lines
  if (unchangedBuffer.length > 0) {
    flushUnchanged();
  }

  return result;
}

export function DiffView({ oldContent, newContent, filePath, editId }: DiffViewProps) {
  const undoEdit = useAIChatStore((s) => s.undoEdit);
  const getEdit = useAIChatStore((s) => s.getEdit);
  const [isUndoing, setIsUndoing] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  const filename = filePath.split("/").pop() || filePath;

  const diffLines = useMemo(
    () => generateDiffLines(oldContent, newContent),
    [oldContent, newContent]
  );

  const collapsedLines = useMemo(
    () => collapseDiffLines(diffLines),
    [diffLines]
  );

  // Check if edit can still be undone
  const canUndo = getEdit(editId) !== undefined;

  const handleUndo = async () => {
    setIsUndoing(true);
    try {
      const success = await undoEdit(editId);
      if (success) {
        toast.success("Edit undone", {
          description: `Restored ${filename}`,
        });
      } else {
        toast.error("Failed to undo", {
          description: "The edit may have already been undone",
        });
      }
    } catch (error) {
      toast.error("Failed to undo", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsUndoing(false);
    }
  };

  const addedCount = diffLines.filter((l) => l.type === "add").length;
  const removedCount = diffLines.filter((l) => l.type === "remove").length;

  return (
    <div className="rounded-md border text-xs my-2 overflow-hidden bg-muted/30 min-w-0">
      {/* Header */}
      <div className="flex items-center justify-between bg-muted/50 px-2 py-1 border-b gap-2 min-w-0">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1 min-w-0 hover:bg-muted rounded px-1 py-0.5 -ml-1 flex-1"
        >
          {isExpanded ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )}
          <span className="font-medium truncate min-w-0">{filename}</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-muted-foreground whitespace-nowrap">
            <span className="text-green-600 dark:text-green-400">+{addedCount}</span>
            {" / "}
            <span className="text-red-600 dark:text-red-400">-{removedCount}</span>
          </span>

          {canUndo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleUndo}
              disabled={isUndoing}
              className="h-6 px-2 text-xs shrink-0"
            >
              <Undo2 className="h-3 w-3 mr-1" />
              {isUndoing ? "..." : "Undo"}
            </Button>
          )}
        </div>
      </div>

      {/* Diff lines */}
      {isExpanded && (
        <ScrollArea className="max-w-full">
          <pre className="p-2 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words min-w-0">
            {collapsedLines.map((line, i) => {
              if ("count" in line) {
                return (
                  <div
                    key={`collapsed-${i}`}
                    className="text-muted-foreground text-center py-0.5 border-y border-dashed border-border my-0.5"
                  >
                    ⋯ {line.count} unchanged lines ⋯
                  </div>
                );
              }

              return (
                <div
                  key={i}
                  className={cn(
                    "px-1 -mx-1 break-words",
                    line.type === "add" &&
                      "bg-green-500/15 text-green-700 dark:text-green-400",
                    line.type === "remove" &&
                      "bg-red-500/15 text-red-700 dark:text-red-400"
                  )}
                >
                  <span className="select-none opacity-50 w-4 inline-block shrink-0">
                    {line.type === "add"
                      ? "+"
                      : line.type === "remove"
                      ? "-"
                      : " "}
                  </span>
                  <span className="break-words">{line.text || " "}</span>
                </div>
              );
            })}
          </pre>
        </ScrollArea>
      )}
    </div>
  );
}
