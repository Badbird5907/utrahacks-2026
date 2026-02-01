"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { X, Plug, PlugZap, Send, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDaemonStore } from "@/lib/daemon-state";
import { cn } from "@/lib/utils";
import { BAUD_RATES } from "@/lib/constants";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

// ANSI escape codes for terminal colors
const ANSI = {
  reset: "\x1b[0m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
};

interface SerialMonitorPanelProps {
  onClose?: () => void;
  className?: string;
  hideHeader?: boolean;
}

export function SerialMonitorPanel({ onClose, className, hideHeader }: SerialMonitorPanelProps) {
  const serialStatus = useDaemonStore((s) => s.serialStatus);
  const serialLogs = useDaemonStore((s) => s.serialLogs);
  const serialError = useDaemonStore((s) => s.serialError);
  const serialPort = useDaemonStore((s) => s.serialPort);
  const serialBaudRate = useDaemonStore((s) => s.serialBaudRate);
  const isSerialMonitorRunning = useDaemonStore((s) => s.isSerialMonitorRunning);
  const daemonStatus = useDaemonStore((s) => s.status);
  
  const startSerialMonitor = useDaemonStore((s) => s.startSerialMonitor);
  const stopSerialMonitor = useDaemonStore((s) => s.stopSerialMonitor);
  const sendSerialData = useDaemonStore((s) => s.sendSerialData);
  const clearSerialLogs = useDaemonStore((s) => s.clearSerialLogs);
  const setSerialBaudRate = useDaemonStore((s) => s.setSerialBaudRate);

  const [inputValue, setInputValue] = useState("");
  const [sendWithNewline, setSendWithNewline] = useState(true);
  
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

    // Write initial message
    terminal.writeln(`${ANSI.dim}Serial Monitor - Click "Connect" to start.${ANSI.reset}`);

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

    // Check if logs were cleared
    if (serialLogs.length === 0 && prevCount > 0) {
      terminal.clear();
      lastLogCountRef.current = 0;
      terminal.writeln(`${ANSI.dim}Logs cleared.${ANSI.reset}`);
      return;
    }

    // Write only new logs
    const newLogs = serialLogs.slice(prevCount);
    lastLogCountRef.current = serialLogs.length;

    for (const log of newLogs) {
      let coloredLog = log;

      // Color system messages
      if (log.startsWith("Connected to")) {
        coloredLog = `${ANSI.green}${log}${ANSI.reset}`;
      } else if (log.startsWith("Disconnected:") || log.startsWith("Error:")) {
        coloredLog = `${ANSI.red}${log}${ANSI.reset}`;
      } else if (log.startsWith("Reconnecting")) {
        coloredLog = `${ANSI.yellow}${log}${ANSI.reset}`;
      } else if (log.startsWith("> ")) {
        // Sent data
        coloredLog = `${ANSI.cyan}${log}${ANSI.reset}`;
      }

      terminal.writeln(coloredLog);
    }
  }, [serialLogs]);

  // Handle send
  const handleSend = useCallback(async () => {
    if (!inputValue.trim()) return;
    
    try {
      const data = sendWithNewline ? inputValue + "\n" : inputValue;
      await sendSerialData(data);
      setInputValue("");
    } catch (error) {
      console.error("Failed to send:", error);
    }
  }, [inputValue, sendWithNewline, sendSerialData]);

  // Handle enter key
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // Handle connect/disconnect
  const handleToggleConnection = useCallback(() => {
    if (isSerialMonitorRunning) {
      stopSerialMonitor();
    } else {
      startSerialMonitor(undefined, serialBaudRate);
    }
  }, [isSerialMonitorRunning, stopSerialMonitor, startSerialMonitor, serialBaudRate]);

  // Handle baud rate change
  const handleBaudRateChange = useCallback((value: string) => {
    const newBaudRate = parseInt(value, 10);
    setSerialBaudRate(newBaudRate);
    
    // If connected, restart with new baud rate
    if (isSerialMonitorRunning) {
      stopSerialMonitor();
      // Small delay to ensure clean disconnect
      setTimeout(() => {
        startSerialMonitor(undefined, newBaudRate);
      }, 100);
    }
  }, [setSerialBaudRate, isSerialMonitorRunning, stopSerialMonitor, startSerialMonitor]);

  // Status indicator
  const statusIndicator = {
    idle: { color: "bg-gray-400", text: "Idle" },
    connecting: { color: "bg-yellow-500 animate-pulse", text: "Connecting..." },
    connected: { color: "bg-green-500", text: serialPort || "Connected" },
    disconnected: { color: "bg-orange-500 animate-pulse", text: "Reconnecting..." },
    error: { color: "bg-red-500", text: serialError || "Error" },
  }[serialStatus];

  const isConnected = serialStatus === "connected";
  const canConnect = daemonStatus === "connected" && !isSerialMonitorRunning;
  const canDisconnect = isSerialMonitorRunning;

  return (
    <div className={cn("flex flex-col bg-muted/30", className)}>
      {/* Header - hidden when used inside OutputPanel */}
      {!hideHeader && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/50">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Serial Monitor</span>
            <span className={cn("h-2 w-2 rounded-full", statusIndicator.color)} />
            <span className="text-xs text-muted-foreground truncate max-w-32" title={statusIndicator.text}>
              {statusIndicator.text}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Baud Rate Selector */}
            <Select value={serialBaudRate.toString()} onValueChange={handleBaudRateChange}>
              <SelectTrigger className="text-xs h-6 w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BAUD_RATES.map((rate) => (
                  <SelectItem key={rate.value} value={rate.value} className="text-xs">
                    {rate.label} baud
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Connect/Disconnect Button */}
            <Button
              variant={isSerialMonitorRunning ? "destructive" : "default"}
              size="sm"
              onClick={handleToggleConnection}
              disabled={!canConnect && !canDisconnect}
              className="h-6 px-2 text-xs"
            >
              {serialStatus === "connecting" ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : isSerialMonitorRunning ? (
                <PlugZap className="h-3 w-3 mr-1" />
              ) : (
                <Plug className="h-3 w-3 mr-1" />
              )}
              {isSerialMonitorRunning ? "Disconnect" : "Connect"}
            </Button>

            {/* Clear Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSerialLogs}
              disabled={serialLogs.length === 0}
              className="h-6 px-2 text-xs"
              title="Clear logs"
            >
              <Trash2 className="h-3 w-3" />
            </Button>

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

      {/* Input area */}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/30">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send data to Arduino..."
          disabled={!isConnected}
          className="h-8 text-sm flex-1"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!isConnected || !inputValue.trim()}
          className="h-8 px-3"
        >
          <Send className="h-3.5 w-3.5 mr-1" />
          Send
        </Button>
        <label className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
          <input
            type="checkbox"
            checked={sendWithNewline}
            onChange={(e) => setSendWithNewline(e.target.checked)}
            className="h-3 w-3"
          />
          Newline
        </label>
      </div>
    </div>
  );
}
