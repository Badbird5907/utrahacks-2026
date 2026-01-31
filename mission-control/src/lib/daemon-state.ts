import { create } from "zustand";
import {
  DaemonClient,
  getDaemonClient,
  SerialPortInfo,
  UploadSSEEvent,
  CompileSSEEvent,
  UploadSketchSSEEvent,
  CompileRequest,
  UploadSketchRequest,
  ConnectedBoard,
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
export type CompileStatus = "idle" | "compiling" | "success" | "error";

interface DaemonState {
  // Connection state
  status: DaemonConnectionStatus;
  error: string | null;
  daemonVersion: number | null;

  // Serial ports
  serialPorts: SerialPortInfo[];
  selectedPort: string | null;

  // Connected boards (with auto-detected FQBN)
  connectedBoards: ConnectedBoard[];
  selectedFqbn: string | null;

  // Compile state
  compileStatus: CompileStatus;
  compileLogs: string[];
  compileError: string | null;
  lastBuildPath: string | null;
  lastOutputPath: string | null;

  // Upload state
  uploadStatus: UploadStatus;
  uploadLogs: string[];
  uploadError: string | null;

  // Internal
  _client: DaemonClient | null;
  _compileAbort: AbortController | null;

  // Actions
  checkConnection: () => Promise<boolean>;
  fetchSerialPorts: () => Promise<void>;
  fetchConnectedBoards: () => Promise<void>;
  setSelectedPort: (port: string | null) => void;
  setSelectedFqbn: (fqbn: string | null) => void;
  compileSketch: (sketchPath: string, fqbn?: string) => Promise<boolean>;
  uploadSketch: (sketchPath: string, fqbn?: string, port?: string) => Promise<boolean>;
  cancelCompile: () => void;
  clearCompileLogs: () => void;
  resetCompileStatus: () => void;
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
  connectedBoards: [],
  selectedFqbn: null,
  compileStatus: "idle",
  compileLogs: [],
  compileError: null,
  lastBuildPath: null,
  lastOutputPath: null,
  uploadStatus: "idle",
  uploadLogs: [],
  uploadError: null,
  _client: null,
  _compileAbort: null,

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
   * Fetch connected boards with auto-detected FQBN
   */
  fetchConnectedBoards: async () => {
    const { _client, status } = get();

    if (status !== "connected" || !_client) {
      return;
    }

    try {
      const boards = await _client.getConnectedBoards();
      set({ connectedBoards: boards });

      // Auto-select FQBN if we don't have one and a board is detected
      const { selectedFqbn } = get();
      if (!selectedFqbn && boards.length > 0) {
        const boardWithFqbn = boards.find(
          (b) => b.matching_boards && b.matching_boards.length > 0
        );
        if (boardWithFqbn?.matching_boards?.[0]?.fqbn) {
          set({ selectedFqbn: boardWithFqbn.matching_boards[0].fqbn });
        }
      }
    } catch (err) {
      console.error("Failed to fetch connected boards:", err);
    }
  },

  /**
   * Set the selected FQBN (board type)
   */
  setSelectedFqbn: (fqbn: string | null) => {
    set({ selectedFqbn: fqbn });
  },

  /**
   * Compile an Arduino sketch
   * Streams progress via SSE and updates logs
   */
  compileSketch: async (sketchPath: string, fqbn?: string) => {
    const { _client, status, selectedFqbn } = get();

    if (status !== "connected" || !_client) {
      set({
        compileStatus: "error",
        compileError: "Not connected to daemon",
      });
      return false;
    }

    // Use provided fqbn, or fall back to selectedFqbn
    const targetFqbn = fqbn || selectedFqbn;

    // Cancel any existing compile
    const { _compileAbort } = get();
    if (_compileAbort) {
      _compileAbort.abort();
    }

    const abortController = new AbortController();

    set({
      compileStatus: "compiling",
      compileLogs: [],
      compileError: null,
      lastBuildPath: null,
      lastOutputPath: null,
      _compileAbort: abortController,
    });

    try {
      const addLog = (message: string) => {
        set((state) => ({
          compileLogs: [...state.compileLogs, message],
        }));
      };

      const request: CompileRequest = {
        sketchPath,
        fqbn: targetFqbn || undefined,
        exportBinaries: true,
      };

      for await (const event of _client.compileSketch(request, abortController.signal)) {
        switch (event.event) {
          case "start":
            addLog(`Compiling ${event.data.sketchPath} for ${event.data.fqbn}...`);
            break;
          case "stdout":
            // Split multi-line output and add each line
            event.data.data.split('\n').forEach((line) => {
              if (line.trim()) addLog(line);
            });
            break;
          case "stderr":
            event.data.data.split('\n').forEach((line) => {
              if (line.trim()) addLog(`[warn] ${line}`);
            });
            break;
          case "success":
            addLog(`Compilation successful!`);
            set({
              compileStatus: "success",
              lastBuildPath: event.data.buildPath || null,
              lastOutputPath: event.data.outputPath || null,
              _compileAbort: null,
            });
            return true;
          case "error":
            addLog(`Error: ${event.data.message}`);
            set({
              compileStatus: "error",
              compileError: event.data.message,
              _compileAbort: null,
            });
            return false;
          case "done":
            break;
        }
      }

      // If we got here without explicit success/error, assume success
      set({ compileStatus: "success", _compileAbort: null });
      return true;
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") {
        set({ compileStatus: "idle", _compileAbort: null });
        return false;
      }

      const errorMessage =
        err instanceof Error ? err.message : "Compilation failed";

      set((state) => ({
        compileStatus: "error",
        compileError: errorMessage,
        compileLogs: [...state.compileLogs, `Error: ${errorMessage}`],
        _compileAbort: null,
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
   * Cancel ongoing compilation
   */
  cancelCompile: () => {
    const { _compileAbort } = get();
    if (_compileAbort) {
      _compileAbort.abort();
      set({
        compileStatus: "idle",
        _compileAbort: null,
      });
    }
  },

  /**
   * Clear compile logs
   */
  clearCompileLogs: () => {
    set({ compileLogs: [] });
  },

  /**
   * Reset compile status to idle
   */
  resetCompileStatus: () => {
    set({
      compileStatus: "idle",
      compileLogs: [],
      compileError: null,
      lastBuildPath: null,
      lastOutputPath: null,
    });
  },

  /**
   * Compile and upload an Arduino sketch
   * Combines compilation and upload into a single operation
   */
  uploadSketch: async (sketchPath: string, fqbn?: string, port?: string) => {
    const { _client, status, selectedFqbn, selectedPort } = get();

    if (status !== "connected" || !_client) {
      set({
        compileStatus: "error",
        compileError: "Not connected to daemon",
      });
      return false;
    }

    // Use provided values or fall back to selected ones
    const targetFqbn = fqbn || selectedFqbn;
    const targetPort = port || selectedPort;

    // Cancel any existing compile
    const { _compileAbort } = get();
    if (_compileAbort) {
      _compileAbort.abort();
    }

    const abortController = new AbortController();

    set({
      compileStatus: "compiling",
      compileLogs: [],
      compileError: null,
      _compileAbort: abortController,
    });

    try {
      const addLog = (message: string) => {
        set((state) => ({
          compileLogs: [...state.compileLogs, message],
        }));
      };

      const request: UploadSketchRequest = {
        sketchPath,
        fqbn: targetFqbn || undefined,
        port: targetPort || undefined,
      };

      for await (const event of _client.uploadSketch(request, abortController.signal)) {
        switch (event.event) {
          case "start":
            addLog(`Uploading ${event.data.sketchPath} to ${event.data.port}...`);
            addLog(`Board: ${event.data.fqbn}`);
            break;
          case "stdout":
            event.data.data.split('\n').forEach((line) => {
              if (line.trim()) addLog(line);
            });
            break;
          case "stderr":
            event.data.data.split('\n').forEach((line) => {
              if (line.trim()) addLog(`[warn] ${line}`);
            });
            break;
          case "success":
            addLog(`Upload successful!`);
            set({
              compileStatus: "success",
              _compileAbort: null,
            });
            return true;
          case "error":
            addLog(`Error: ${event.data.message}`);
            set({
              compileStatus: "error",
              compileError: event.data.message,
              _compileAbort: null,
            });
            return false;
          case "done":
            break;
        }
      }

      // If we got here without explicit success/error, assume success
      set({ compileStatus: "success", _compileAbort: null });
      return true;
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") {
        set({ compileStatus: "idle", _compileAbort: null });
        return false;
      }

      const errorMessage =
        err instanceof Error ? err.message : "Upload failed";

      set((state) => ({
        compileStatus: "error",
        compileError: errorMessage,
        compileLogs: [...state.compileLogs, `Error: ${errorMessage}`],
        _compileAbort: null,
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
