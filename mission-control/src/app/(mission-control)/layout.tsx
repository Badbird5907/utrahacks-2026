"use client";

import { useEffect } from "react";
import { useDaemonStore } from "@/lib/daemon-state";
import { DaemonConnectionDialog } from "@/components/daemon-connection-dialog";

export default function MissionControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { status, checkConnection } = useDaemonStore();

  useEffect(() => {
    checkConnection();
  }, [checkConnection]);

  const showDialog = status === "disconnected" || status === "error";

  return (
    <>
      <DaemonConnectionDialog open={showDialog} />
      {status === "checking" ? (
        <div className="flex h-screen w-screen items-center justify-center">
          <div className="text-muted-foreground">Connecting to daemon...</div>
        </div>
      ) : (
        children
      )}
    </>
  );
}
