"use client";

import { useCallback, useRef, useState } from "react";
import { useDaemonStore } from "@/lib/daemon-state";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Upload,
  FileCode,
  CheckCircle2,
  XCircle,
  RefreshCw,
  ArrowLeft,
  Usb,
} from "lucide-react";
import Link from "next/link";

export default function UploadFirmwarePage() {
  const {
    serialPorts,
    selectedPort,
    setSelectedPort,
    fetchSerialPorts,
    uploadStatus,
    uploadLogs,
    uploadError,
    uploadFirmware,
    resetUploadStatus,
  } = useDaemonStore();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        setSelectedFile(file);
        resetUploadStatus();
      }
    },
    [resetUploadStatus]
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setIsDragging(false);

      const file = event.dataTransfer.files?.[0];
      if (file && (file.name.endsWith(".bin") || file.name.endsWith(".hex"))) {
        setSelectedFile(file);
        resetUploadStatus();
      }
    },
    [resetUploadStatus]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;
    await uploadFirmware(selectedFile);
  }, [selectedFile, uploadFirmware]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    resetUploadStatus();
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [resetUploadStatus]);

  const isUploading = uploadStatus === "uploading";
  const isSuccess = uploadStatus === "success";
  const isError = uploadStatus === "error";

  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      <div className="mb-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="size-4" />
          Back to Editor
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="size-5" />
            Upload Firmware
          </CardTitle>
          <CardDescription>
            Upload a compiled firmware file (.bin or .hex) to your device
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Serial Port</label>
              <Button
                variant="ghost"
                size="xs"
                onClick={fetchSerialPorts}
                disabled={isUploading}
              >
                <RefreshCw className="size-3" />
                Refresh
              </Button>
            </div>
            <select
              value={selectedPort || ""}
              onChange={(e) => setSelectedPort(e.target.value || null)}
              disabled={isUploading}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] outline-none disabled:opacity-50"
            >
              <option value="">Select a port...</option>
              {serialPorts.map((port) => (
                <option key={port.path} value={port.path}>
                  {port.path}
                  {port.manufacturer ? ` (${port.manufacturer})` : ""}
                  {port.vendorId === "2341" ? " - Arduino" : ""}
                </option>
              ))}
            </select>
            {serialPorts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No serial ports found. Make sure your device is connected.
              </p>
            )}
          </div>

          <div
            onClick={() => !isUploading && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"}
              ${isUploading ? "pointer-events-none opacity-50" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".bin,.hex"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isUploading}
            />

            {selectedFile ? (
              <div className="flex flex-col items-center gap-2">
                <FileCode className="size-10 text-primary" />
                <p className="font-medium">{selectedFile.name}</p>
                <p className="text-sm text-muted-foreground">
                  {(selectedFile.size / 1024).toFixed(2)} KB
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="size-10 text-muted-foreground" />
                <p className="font-medium">Drop firmware file here</p>
                <p className="text-sm text-muted-foreground">
                  or click to browse (.bin, .hex)
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleUpload}
              disabled={!selectedFile || !selectedPort || isUploading}
              className="flex-1"
            >
              {isUploading ? (
                <>
                  <Spinner />
                  Uploading...
                </>
              ) : isSuccess ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Upload Complete
                </>
              ) : isError ? (
                <>
                  <XCircle className="size-4" />
                  Upload Failed - Retry
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  Upload Firmware
                </>
              )}
            </Button>

            {(selectedFile || uploadLogs.length > 0) && (
              <Button variant="outline" onClick={handleReset} disabled={isUploading}>
                Clear
              </Button>
            )}
          </div>

          {isSuccess && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-green-500/10 text-green-600 dark:text-green-400">
              <CheckCircle2 className="size-5" />
              <span className="text-sm font-medium">
                Firmware uploaded successfully!
              </span>
            </div>
          )}

          {isError && uploadError && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive">
              <XCircle className="size-5" />
              <span className="text-sm font-medium">{uploadError}</span>
            </div>
          )}

          {uploadLogs.length > 0 && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Upload Log</label>
              <div className="h-48 overflow-y-auto rounded-md border bg-muted/50 p-3 font-mono text-xs">
                {uploadLogs.map((log, index) => (
                  <div
                    key={index}
                    className={`whitespace-pre-wrap ${
                      log.startsWith("[stderr]")
                        ? "text-yellow-600 dark:text-yellow-400"
                        : log.startsWith("Error:")
                          ? "text-destructive"
                          : log.startsWith("Success:")
                            ? "text-green-600 dark:text-green-400"
                            : "text-muted-foreground"
                    }`}
                  >
                    {log}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
