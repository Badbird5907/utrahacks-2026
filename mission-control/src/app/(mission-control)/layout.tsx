"use client";

import { useEffect } from "react";
import { useDaemonStore } from "@/lib/daemon-state";
import { DaemonConnectionDialog } from "@/components/daemon-connection-dialog";

export default function MissionControlLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const status = useDaemonStore((s) => s.status);
  const checkConnection = useDaemonStore((s) => s.checkConnection);

  useEffect(() => {
    checkConnection();
    // Only run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
