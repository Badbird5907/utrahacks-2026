"use client";

import { useEffect, useRef } from "react";
import { X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDaemonStore, CompileStatus } from "@/lib/daemon-state";
import { cn } from "@/lib/utils";

interface CompileOutputPanelProps {
  onClose?: () => void;
  className?: string;
}

export function CompileOutputPanel({ onClose, className }: CompileOutputPanelProps) {
  const compileStatus = useDaemonStore((s) => s.compileStatus);
  const compileLogs = useDaemonStore((s) => s.compileLogs);
  const compileError = useDaemonStore((s) => s.compileError);
  const cancelCompile = useDaemonStore((s) => s.cancelCompile);
  const clearCompileLogs = useDaemonStore((s) => s.clearCompileLogs);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [compileLogs]);

  const statusIcon = {
    idle: null,
    compiling: <Loader2 className="h-4 w-4 animate-spin text-blue-500" />,
    success: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    error: <XCircle className="h-4 w-4 text-red-500" />,
  }[compileStatus];

  const statusText = {
    idle: "Ready",
    compiling: "Compiling...",
    success: "Compilation successful",
    error: compileError || "Compilation failed",
  }[compileStatus];

  return (
    <div className={cn("flex flex-col border-t border-border bg-muted/30", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Output</span>
          {statusIcon}
          <span className="text-xs text-muted-foreground">{statusText}</span>
        </div>
        <div className="flex items-center gap-1">
          {compileStatus === "compiling" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={cancelCompile}
              className="h-6 px-2 text-xs"
            >
              Cancel
            </Button>
          )}
          {compileLogs.length > 0 && compileStatus !== "compiling" && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearCompileLogs}
              className="h-6 px-2 text-xs"
            >
              Clear
            </Button>
          )}
          {onClose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-6 w-6 p-0"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Log output */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed"
      >
        {compileLogs.length === 0 ? (
          <p className="text-muted-foreground">
            Click &quot;Verify&quot; to compile your sketch.
          </p>
        ) : (
          compileLogs.map((log, index) => (
            <div
              key={index}
              className={cn(
                "whitespace-pre-wrap",
                log.startsWith("[warn]") && "text-yellow-600 dark:text-yellow-400",
                log.startsWith("Error:") && "text-red-600 dark:text-red-400",
                log.includes("successful") && "text-green-600 dark:text-green-400 font-semibold"
              )}
            >
              {log}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
