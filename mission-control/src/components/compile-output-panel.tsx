"use client";

import { useEffect, useRef } from "react";
import { X, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDaemonStore } from "@/lib/daemon-state";
import { cn } from "@/lib/utils";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// ANSI escape codes for terminal colors
const ANSI = {
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

interface CompileOutputPanelProps {
  onClose?: () => void;
  className?: string;
  hideHeader?: boolean;
}

export function CompileOutputPanel({ onClose, className, hideHeader }: CompileOutputPanelProps) {
  const compileStatus = useDaemonStore((s) => s.compileStatus);
  const compileLogs = useDaemonStore((s) => s.compileLogs);
  const compileError = useDaemonStore((s) => s.compileError);
  const cancelCompile = useDaemonStore((s) => s.cancelCompile);
  const clearCompileLogs = useDaemonStore((s) => s.clearCompileLogs);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastLogCountRef = useRef(0);

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      cursorBlink: false,
      disableStdin: true,
      fontSize: 12,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: 1.2,
      scrollback: 1000,
      convertEol: true,
      theme: {
        background: "transparent",
        cursor: "transparent",
      },
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Write initial placeholder
    terminal.writeln(`${ANSI.dim}Click "Verify" to compile your sketch.${ANSI.reset}`);

    // Handle resize
    const handleResize = () => {
      fitAddon.fit();
    };

    window.addEventListener("resize", handleResize);

    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", handleResize);
      resizeObserver.disconnect();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, []);

  // Sync logs to terminal
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;

    const prevCount = lastLogCountRef.current;

    // Check if logs were cleared (had logs before, now empty)
    if (compileLogs.length === 0 && prevCount > 0) {
      terminal.clear();
      lastLogCountRef.current = 0;
      terminal.writeln(`${ANSI.dim}Click "Verify" to compile your sketch.${ANSI.reset}`);
      return;
    }

    // Write only new logs
    const newLogs = compileLogs.slice(prevCount);
    lastLogCountRef.current = compileLogs.length;

    for (const log of newLogs) {
      let coloredLog = log;

      if (log.startsWith("[warn]")) {
        coloredLog = `${ANSI.yellow}${log}${ANSI.reset}`;
      } else if (log.startsWith("Error:") || log.toLowerCase().includes("error:")) {
        coloredLog = `${ANSI.red}${log}${ANSI.reset}`;
      } else if (log.includes("successful")) {
        coloredLog = `${ANSI.green}${ANSI.bold}${log}${ANSI.reset}`;
      }

      terminal.writeln(coloredLog);
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
    <div className={cn("flex flex-col bg-muted/30", className)}>
      {/* Header - hidden when used inside OutputPanel */}
      {!hideHeader && (
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
      )}

      {/* Terminal output */}
      <div ref={containerRef} className="flex-1 overflow-hidden p-1" />
    </div>
  );
}
