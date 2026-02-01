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
  SerialMonitorSSEEvent,
  SerialMonitorStatus,
  SerialMonitorState,
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

// Re-export serial monitor types
export type { SerialMonitorStatus, SerialMonitorState } from "./daemon-client";

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

  // Serial monitor state
  serialStatus: SerialMonitorStatus;
  serialLogs: string[];
  serialError: string | null;
  serialPort: string | null;
  serialBaudRate: number;
  isSerialMonitorRunning: boolean;

  // Internal
  _client: DaemonClient | null;
  _compileAbort: AbortController | null;
  _serialAbort: AbortController | null;

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

  // Serial monitor actions
  startSerialMonitor: (port?: string, baudRate?: number) => Promise<void>;
  stopSerialMonitor: () => void;
  sendSerialData: (data: string) => Promise<void>;
  clearSerialLogs: () => void;
  setSerialBaudRate: (baudRate: number) => void;
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
  serialStatus: "idle",
  serialLogs: [],
  serialError: null,
  serialPort: null,
  serialBaudRate: 9600,
  isSerialMonitorRunning: false,
  _client: null,
  _compileAbort: null,
  _serialAbort: null,

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

  // ==========================================================================
  // Serial Monitor Actions
  // ==========================================================================

  /**
   * Start the serial monitor and subscribe to events
   */
  startSerialMonitor: async (port?: string, baudRate?: number) => {
    const { _client, status, _serialAbort, serialBaudRate } = get();

    if (status !== "connected" || !_client) {
      set({
        serialStatus: "error",
        serialError: "Not connected to daemon",
      });
      return;
    }

    // Cancel any existing subscription
    if (_serialAbort) {
      _serialAbort.abort();
    }

    const abortController = new AbortController();
    const targetBaudRate = baudRate ?? serialBaudRate;

    set({
      serialStatus: "connecting",
      serialError: null,
      serialBaudRate: targetBaudRate,
      isSerialMonitorRunning: true,
      _serialAbort: abortController,
    });

    try {
      // Start the serial monitor on the daemon
      await _client.startSerialMonitor(port, targetBaudRate);

      // Subscribe to events
      const addLog = (message: string) => {
        set((state) => {
          // Split by newlines and filter empty lines
          const newLogs = message.split('\n').filter(line => line.trim());
          if (newLogs.length === 0) return state;
          
          // Keep only last 1000 lines
          const combined = [...state.serialLogs, ...newLogs];
          const trimmed = combined.length > 1000 ? combined.slice(-1000) : combined;
          return { serialLogs: trimmed };
        });
      };

      for await (const event of _client.subscribeSerialMonitor(abortController.signal)) {
        switch (event.event) {
          case "status":
            set({
              serialStatus: event.data.status,
              serialPort: event.data.port,
              serialBaudRate: event.data.baudRate,
              serialError: event.data.error,
            });
            break;

          case "connected":
            set({
              serialStatus: "connected",
              serialPort: event.data.port,
              serialBaudRate: event.data.baudRate,
              serialError: null,
            });
            addLog(`Connected to ${event.data.port} at ${event.data.baudRate} baud`);
            break;

          case "disconnected":
            set({
              serialStatus: "disconnected",
              serialError: event.data.reason,
            });
            addLog(`Disconnected: ${event.data.reason}`);
            break;

          case "reconnecting":
            set({ serialStatus: "connecting" });
            addLog(`Reconnecting to ${event.data.port}...`);
            break;

          case "data":
            addLog(event.data.data);
            break;

          case "sent":
            // Sent data is already logged by daemon
            break;

          case "history":
            // Received log history on connect
            set((state) => ({
              serialLogs: [...state.serialLogs, ...event.data.logs],
            }));
            break;

          case "cleared":
            set({ serialLogs: [] });
            break;

          case "stopped":
            set({
              serialStatus: "idle",
              isSerialMonitorRunning: false,
            });
            break;

          case "error":
            set({
              serialStatus: "error",
              serialError: event.data.message,
            });
            addLog(`Error: ${event.data.message}`);
            break;

          case "keepalive":
            // Ignore keepalive events
            break;
        }
      }
    } catch (err) {
      // Ignore abort errors
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : "Serial monitor failed";

      set({
        serialStatus: "error",
        serialError: errorMessage,
        isSerialMonitorRunning: false,
        _serialAbort: null,
      });

      // Check if daemon disconnected
      if (
        errorMessage.includes("fetch") ||
        errorMessage.includes("network") ||
        errorMessage.includes("Failed to fetch")
      ) {
        set({ status: "disconnected", error: "Lost connection to daemon" });
      }
    }
  },

  /**
   * Stop the serial monitor
   */
  stopSerialMonitor: () => {
    const { _client, _serialAbort } = get();

    // Abort the SSE subscription
    if (_serialAbort) {
      _serialAbort.abort();
    }

    // Tell daemon to stop
    if (_client) {
      _client.stopSerialMonitor().catch((err) => {
        console.error("Failed to stop serial monitor:", err);
      });
    }

    set({
      serialStatus: "idle",
      isSerialMonitorRunning: false,
      _serialAbort: null,
    });
  },

  /**
   * Send data to Arduino via serial
   */
  sendSerialData: async (data: string) => {
    const { _client, serialStatus } = get();

    if (!_client) {
      throw new Error("Not connected to daemon");
    }

    if (serialStatus !== "connected") {
      throw new Error("Serial port not connected");
    }

    await _client.sendSerialData(data);
  },

  /**
   * Clear serial logs
   */
  clearSerialLogs: () => {
    const { _client } = get();
    
    set({ serialLogs: [] });
    
    // Also clear on daemon
    if (_client) {
      _client.clearSerialLogs().catch((err) => {
        console.error("Failed to clear serial logs on daemon:", err);
      });
    }
  },

  /**
   * Set serial baud rate (requires restart to take effect)
   */
  setSerialBaudRate: (baudRate: number) => {
    set({ serialBaudRate: baudRate });
  },
}));
