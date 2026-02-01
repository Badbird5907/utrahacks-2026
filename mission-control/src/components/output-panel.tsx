"use client";

import { useState, useCallback } from "react";
import { X, CheckCircle2, XCircle, Loader2, Plug, PlugZap, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompileOutputPanel } from "@/components/compile-output-panel";
import { SerialMonitorPanel } from "@/components/serial-monitor-panel";
import { useDaemonStore } from "@/lib/daemon-state";
import { cn } from "@/lib/utils";
import { BAUD_RATES } from "@/lib/constants";

interface OutputPanelProps {
  onClose?: () => void;
  className?: string;
  defaultTab?: "output" | "serial";
}

export function OutputPanel({ onClose, className, defaultTab = "output" }: OutputPanelProps) {
  const [activeTab, setActiveTab] = useState<"output" | "serial">(defaultTab);
  
  // Compile state
  const compileStatus = useDaemonStore((s) => s.compileStatus);
  const compileError = useDaemonStore((s) => s.compileError);
  const compileLogs = useDaemonStore((s) => s.compileLogs);
  const cancelCompile = useDaemonStore((s) => s.cancelCompile);
  const clearCompileLogs = useDaemonStore((s) => s.clearCompileLogs);

  // Serial state
  const serialStatus = useDaemonStore((s) => s.serialStatus);
  const serialPort = useDaemonStore((s) => s.serialPort);
  const serialBaudRate = useDaemonStore((s) => s.serialBaudRate);
  const serialLogs = useDaemonStore((s) => s.serialLogs);
  const isSerialMonitorRunning = useDaemonStore((s) => s.isSerialMonitorRunning);
  const daemonStatus = useDaemonStore((s) => s.status);
  
  const startSerialMonitor = useDaemonStore((s) => s.startSerialMonitor);
  const stopSerialMonitor = useDaemonStore((s) => s.stopSerialMonitor);
  const clearSerialLogs = useDaemonStore((s) => s.clearSerialLogs);
  const setSerialBaudRate = useDaemonStore((s) => s.setSerialBaudRate);

  // Status indicators for tabs
  const compileIndicator = {
    idle: null,
    compiling: "bg-blue-500 animate-pulse",
    success: "bg-green-500",
    error: "bg-red-500",
  }[compileStatus];

  const serialIndicator = {
    idle: "bg-gray-400",
    connecting: "bg-yellow-500 animate-pulse",
    connected: "bg-green-500",
    disconnected: "bg-orange-500 animate-pulse",
    error: "bg-red-500",
  }[serialStatus];

  // Compile status
  const compileStatusIcon = {
    idle: null,
    compiling: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
    success: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
    error: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  }[compileStatus];

  const compileStatusText = {
    idle: null,
    compiling: "Compiling...",
    success: "Compilation successful",
    error: compileError || "Compilation failed",
  }[compileStatus];

  // Serial status
  const serialStatusInfo = {
    idle: { color: "bg-gray-400", text: "Idle" },
    connecting: { color: "bg-yellow-500 animate-pulse", text: "Connecting..." },
    connected: { color: "bg-green-500", text: serialPort || "Connected" },
    disconnected: { color: "bg-orange-500 animate-pulse", text: "Reconnecting..." },
    error: { color: "bg-red-500", text: "Error" },
  }[serialStatus];

  const canConnect = daemonStatus === "connected" && !isSerialMonitorRunning;
  const canDisconnect = isSerialMonitorRunning;

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
    
    if (isSerialMonitorRunning) {
      stopSerialMonitor();
      setTimeout(() => {
        startSerialMonitor(undefined, newBaudRate);
      }, 100);
    }
  }, [setSerialBaudRate, isSerialMonitorRunning, stopSerialMonitor, startSerialMonitor]);

  return (
    <div className={cn("flex flex-col bg-muted/30 h-full", className)}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "output" | "serial")}
        className="flex flex-col h-full"
      >
        {/* Unified Header Bar */}
        <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-muted/50 shrink-0">
          {/* Left: Tabs */}
          <div className="flex items-center gap-3">
            <TabsList className="h-7 bg-transparent p-0 gap-1">
              <TabsTrigger
                value="output"
                className="h-6 px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <span className="flex items-center gap-1.5">
                  Output
                  {compileIndicator && (
                    <span className={cn("h-1.5 w-1.5 rounded-full", compileIndicator)} />
                  )}
                </span>
              </TabsTrigger>
              <TabsTrigger
                value="serial"
                className="h-6 px-3 text-xs data-[state=active]:bg-background data-[state=active]:shadow-sm"
              >
                <span className="flex items-center gap-1.5">
                  Serial Monitor
                  {isSerialMonitorRunning && (
                    <span className={cn("h-1.5 w-1.5 rounded-full", serialIndicator)} />
                  )}
                </span>
              </TabsTrigger>
            </TabsList>

            {/* Status text for active tab */}
            {activeTab === "output" && compileStatusIcon && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                {compileStatusIcon}
                <span>{compileStatusText}</span>
              </div>
            )}
            {activeTab === "serial" && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={cn("h-2 w-2 rounded-full", serialStatusInfo.color)} />
                <span className="truncate max-w-32">{serialStatusInfo.text}</span>
              </div>
            )}
          </div>

          {/* Right: Controls for active tab */}
          <div className="flex items-center gap-1">
            {/* Output tab controls */}
            {activeTab === "output" && (
              <>
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
              </>
            )}

            {/* Serial tab controls */}
            {activeTab === "serial" && (
              <>
                <Select value={serialBaudRate.toString()} onValueChange={handleBaudRateChange}>
                  <SelectTrigger className="h-6 w-32 text-xs">
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

                <Button
                  variant={isSerialMonitorRunning ? "destructive" : "default"}
                  size="sm"
                  onClick={handleToggleConnection}
                  disabled={!canConnect && !canDisconnect}
                  className="h-8 px-2 text-xs"
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
              </>
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

        {/* Tab Content */}
        <TabsContent value="output" className="flex-1 m-0 overflow-hidden">
          <CompileOutputPanel className="h-full" hideHeader />
        </TabsContent>

        <TabsContent value="serial" className="flex-1 m-0 overflow-hidden">
          <SerialMonitorPanel className="h-full" hideHeader />
        </TabsContent>
      </Tabs>
    </div>
  );
}
