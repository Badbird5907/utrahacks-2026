"use client";

import { useDaemonStore } from "@/lib/daemon-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AlertCircle, RefreshCw, WifiOff } from "lucide-react";

interface DaemonConnectionDialogProps {
  open: boolean;
}

export function DaemonConnectionDialog({ open }: DaemonConnectionDialogProps) {
  const { status, error, checkConnection } = useDaemonStore();

  const isChecking = status === "checking";
  const isError = status === "error";

  const handleRetry = () => {
    checkConnection();
  };

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-md"
      >
        <DialogHeader>
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            {isChecking ? (
              <Spinner className="size-6" />
            ) : isError ? (
              <AlertCircle className="size-6 text-destructive" />
            ) : (
              <WifiOff className="size-6 text-muted-foreground" />
            )}
          </div>
          <DialogTitle className="text-center">
            {isChecking
              ? "Connecting to Daemon..."
              : isError
                ? "Connection Error"
                : "Daemon Not Connected"}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isChecking ? (
              "Attempting to connect to the local daemon service..."
            ) : isError ? (
              <>
                An error occurred while connecting to the daemon.
                {error && (
                  <span className="mt-2 block text-destructive">{error}</span>
                )}
              </>
            ) : (
              "The local daemon service is required to communicate with your hardware. Please start the daemon and try again."
            )}
          </DialogDescription>
        </DialogHeader>

        {!isChecking && (
          <div className="rounded-md bg-muted p-4">
            <p className="text-sm font-medium mb-2">To start the daemon:</p>
            <p className="text-xs text-muted-foreground">
              Run the daemon service on port 8152. The daemon handles firmware
              uploads and serial communication with your device.
            </p>
          </div>
        )}

        <DialogFooter className="sm:justify-center">
          <Button
            onClick={handleRetry}
            disabled={isChecking}
            className="w-full sm:w-auto"
          >
            {isChecking ? (
              <>
                <Spinner />
                Connecting...
              </>
            ) : (
              <>
                <RefreshCw className="size-4" />
                Retry Connection
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
