import { create } from "zustand";
import {
  DaemonClient,
  getDaemonClient,
  SerialPortInfo,
  UploadSSEEvent,
} from "./daemon-client";

// ============================================================================
// Types
// ============================================================================

export type DaemonConnectionStatus =
  | "checking"
  | "connected"
  | "disconnected"
  | "error";

export type UploadStatus = "idle" | "uploading" | "success" | "error";

interface DaemonState {
  // Connection state
  status: DaemonConnectionStatus;
  error: string | null;
  daemonVersion: number | null;

  // Serial ports
  serialPorts: SerialPortInfo[];
  selectedPort: string | null;

  // Upload state
  uploadStatus: UploadStatus;
  uploadLogs: string[];
  uploadError: string | null;

  // Internal
  _client: DaemonClient | null;

  // Actions
  checkConnection: () => Promise<boolean>;
  fetchSerialPorts: () => Promise<void>;
  setSelectedPort: (port: string | null) => void;
  uploadFirmware: (file: File) => Promise<boolean>;
  clearUploadLogs: () => void;
  resetUploadStatus: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useDaemonStore = create<DaemonState>((set, get) => ({
  // Initial state
  status: "checking",
  error: null,
  daemonVersion: null,
  serialPorts: [],
  selectedPort: null,
  uploadStatus: "idle",
  uploadLogs: [],
  uploadError: null,
  _client: null,

  /**
   * Check if the daemon is running and update connection status
   * Returns true if connected, false otherwise
   */
  checkConnection: async () => {
    set({ status: "checking", error: null });

    try {
      const client = getDaemonClient();
      const status = await client.checkStatus();

      set({
        status: "connected",
        daemonVersion: status.version,
        error: null,
        _client: client,
      });

      // Auto-fetch serial ports on successful connection
      get().fetchSerialPorts();

      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to connect to daemon";

      // Determine if it's a connection error vs other error
      const isConnectionError =
        errorMessage.includes("fetch") ||
        errorMessage.includes("network") ||
        errorMessage.includes("ECONNREFUSED") ||
        errorMessage.includes("Failed to fetch");

      set({
        status: isConnectionError ? "disconnected" : "error",
        error: isConnectionError
          ? "Cannot connect to daemon service"
          : errorMessage,
        daemonVersion: null,
        _client: null,
      });

      return false;
    }
  },

  /**
   * Fetch available serial ports from the daemon
   */
  fetchSerialPorts: async () => {
    const { _client, status } = get();

    if (status !== "connected" || !_client) {
      return;
    }

    try {
      const ports = await _client.getSerialPorts();
      set({ serialPorts: ports });

      // Auto-select first Arduino device or USB device
      const { selectedPort } = get();
      if (!selectedPort && ports.length > 0) {
        // Prioritize Arduino (vendorId 2341)
        const arduino = ports.find(
          (p) => p.vendorId?.toLowerCase() === "2341"
        );
        if (arduino) {
          set({ selectedPort: arduino.path });
        } else {
          // Fall back to first USB device
          const usb = ports.find(
            (p) => p.pnpId?.includes("USB") && !p.pnpId?.includes("BTHENUM")
          );
          set({ selectedPort: usb?.path || ports[0].path });
        }
      }
    } catch (err) {
      console.error("Failed to fetch serial ports:", err);
      // Don't update connection status here, just log the error
    }
  },

  /**
   * Set the selected serial port
   */
  setSelectedPort: (port: string | null) => {
    set({ selectedPort: port });
  },

  /**
   * Upload firmware file to the daemon
   * Streams progress via SSE and updates logs
   */
  uploadFirmware: async (file: File) => {
    const { _client, status } = get();

    if (status !== "connected" || !_client) {
      set({
        uploadStatus: "error",
        uploadError: "Not connected to daemon",
      });
      return false;
    }

    set({
      uploadStatus: "uploading",
      uploadLogs: [],
      uploadError: null,
    });

    try {
      const addLog = (message: string) => {
        set((state) => ({
          uploadLogs: [...state.uploadLogs, message],
        }));
      };

      for await (const event of _client.uploadFirmware(file)) {
        switch (event.event) {
          case "start":
            addLog(`Starting upload: ${event.data.message}`);
            break;
          case "stdout":
            addLog(event.data.data);
            break;
          case "stderr":
            addLog(`[stderr] ${event.data.data}`);
            break;
          case "success":
            addLog(`Success: ${event.data.message}`);
            set({ uploadStatus: "success" });
            return true;
          case "error":
            addLog(`Error: ${event.data.message}`);
            set({
              uploadStatus: "error",
              uploadError: event.data.message,
            });
            return false;
          case "done":
            addLog(event.data.message);
            break;
        }
      }

      // If we got here without explicit success/error, assume success
      set({ uploadStatus: "success" });
      return true;
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Upload failed";
      
      set((state) => ({
        uploadStatus: "error",
        uploadError: errorMessage,
        uploadLogs: [...state.uploadLogs, `Error: ${errorMessage}`],
      }));

      // Check if daemon disconnected
      if (
        errorMessage.includes("fetch") ||
        errorMessage.includes("network") ||
        errorMessage.includes("Failed to fetch")
      ) {
        set({ status: "disconnected", error: "Lost connection to daemon" });
      }

      return false;
    }
  },

  /**
   * Clear upload logs
   */
  clearUploadLogs: () => {
    set({ uploadLogs: [] });
  },

  /**
   * Reset upload status to idle
   */
  resetUploadStatus: () => {
    set({
      uploadStatus: "idle",
      uploadLogs: [],
      uploadError: null,
    });
  },
}));
