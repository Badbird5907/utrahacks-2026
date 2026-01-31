/**
 * Daemon Client Library
 * 
 * Connects to the local daemon service running on port 8152
 * Provides methods for checking status, managing serial ports, and uploading firmware
 */

const DAEMON_BASE_URL = process.env.NEXT_PUBLIC_DAEMON_URL || 'http://localhost:8152';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DaemonStatus {
  version: number;
  status: 'ok';
}

export interface SerialPortInfo {
  path: string;
  manufacturer?: string;
  serialNumber?: string;
  pnpId?: string;
  locationId?: string;
  productId?: string;
  vendorId?: string;
}

export interface SerialPortsResponse {
  ports: SerialPortInfo[];
}

// SSE Event types for /upload
export type UploadSSEEvent =
  | { event: 'start'; data: { message: string; filePath: string } }
  | { event: 'stdout'; data: { data: string } }
  | { event: 'stderr'; data: { data: string } }
  | { event: 'success'; data: { message: string; exitCode: number } }
  | { event: 'error'; data: { message: string; exitCode?: number } }
  | { event: 'done'; data: { message: string } };

// SSE Event types for /compile
export type CompileSSEEvent =
  | { event: 'start'; data: { message: string; sketchPath: string; fqbn: string } }
  | { event: 'stdout'; data: { data: string } }
  | { event: 'stderr'; data: { data: string } }
  | { event: 'success'; data: { message: string; exitCode: number; outputPath?: string; buildPath?: string; fqbn: string } }
  | { event: 'error'; data: { message: string; exitCode?: number } }
  | { event: 'done'; data: { message: string } };

// SSE Event types for /upload-sketch (compile & upload)
export type UploadSketchSSEEvent =
  | { event: 'start'; data: { message: string; sketchPath: string; fqbn: string; port: string } }
  | { event: 'stdout'; data: { data: string } }
  | { event: 'stderr'; data: { data: string } }
  | { event: 'success'; data: { message: string; exitCode: number } }
  | { event: 'error'; data: { message: string; exitCode?: number } }
  | { event: 'done'; data: { message: string } };

// Compile request
export interface CompileRequest {
  sketchPath: string;
  fqbn?: string;
  exportBinaries?: boolean;
}

// Upload sketch request (compile & upload)
export interface UploadSketchRequest {
  sketchPath: string;
  fqbn?: string;
  port?: string;
}

// Board types
export interface BoardInfo {
  name: string;
  fqbn: string;
  platform?: string;
}

export interface ConnectedBoard {
  port: {
    address: string;
    label?: string;
    protocol?: string;
    protocol_label?: string;
  };
  matching_boards?: BoardInfo[];
}

// SSE Event types for /serial
export type SerialSSEEvent =
  | { event: 'start'; data: { message: string } }
  | { event: 'connected'; data: { message: string } }
  | { event: 'data'; data: { data: string } }
  | { event: 'error'; data: { message: string } }
  | { event: 'done'; data: { message: string } };

// Filesystem types
export interface FileEntry {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size?: number;
  lastModified?: number;
  children?: FileEntry[];
}

export interface SketchInfo {
  valid: boolean;
  error?: string;
  mainFile?: string;
  files?: string[];
  sketchName?: string;
}

export interface FileReadResult {
  content: string;
  size: number;
  lastModified: number;
}

export interface FileWriteResult {
  success: boolean;
  size: number;
  lastModified: number;
}

// SSE Event types for /fs/watch
export type FileWatchSSEEvent =
  | { event: 'ready'; data: { message: string } }
  | { event: 'add'; data: { path: string } }
  | { event: 'change'; data: { path: string } }
  | { event: 'delete'; data: { path: string } }
  | { event: 'addDir'; data: { path: string } }
  | { event: 'deleteDir'; data: { path: string } }
  | { event: 'error'; data: { message: string } };

// ============================================================================
// SSE Stream Parser
// ============================================================================

async function* parseSSEStream<T extends { event: string; data: unknown }>(
  response: Response,
  signal?: AbortSignal
): AsyncGenerator<T> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Response body is not readable');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        break;
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          // Empty line marks end of message
          try {
            const parsedData = JSON.parse(currentData);
            yield { event: currentEvent, data: parsedData } as T;
          } catch {
            // If JSON parsing fails, yield raw data
            yield { event: currentEvent, data: { raw: currentData } } as T;
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

// ============================================================================
// Daemon Client Class
// ============================================================================

export class DaemonClient {
  private baseUrl: string;

  constructor(baseUrl: string = DAEMON_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  /**
   * Check if the daemon is running and get its status
   */
  async checkStatus(): Promise<DaemonStatus> {
    const response = await fetch(`${this.baseUrl}/`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Daemon returned status ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get list of available serial ports
   */
  async getSerialPorts(): Promise<SerialPortInfo[]> {
    const response = await fetch(`${this.baseUrl}/serial/ports`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get serial ports: ${response.status}`);
    }

    const data: SerialPortsResponse = await response.json();
    return data.ports;
  }

  /**
   * Upload firmware file and stream the upload progress
   * Returns an async generator that yields SSE events
   */
  async *uploadFirmware(
    file: File,
    signal?: AbortSignal
  ): AsyncGenerator<UploadSSEEvent> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${this.baseUrl}/upload`, {
      method: 'POST',
      body: formData,
      signal,
    });

    if (!response.ok) {
      throw new Error(`Upload failed: ${response.status}`);
    }

    yield* parseSSEStream<UploadSSEEvent>(response, signal);
  }

  /**
   * Connect to serial port and stream data
   * Returns an async generator that yields SSE events
   * 
   * @param port - Serial port path (auto-detected if not provided)
   * @param baudRate - Baud rate (defaults to 9600)
   */
  async *connectSerial(
    port?: string,
    baudRate: number = 9600,
    signal?: AbortSignal
  ): AsyncGenerator<SerialSSEEvent> {
    const params = new URLSearchParams();
    if (port) params.set('port', port);
    params.set('baudRate', baudRate.toString());

    const url = `${this.baseUrl}/serial?${params.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to connect to serial port: ${response.status}`);
    }

    yield* parseSSEStream<SerialSSEEvent>(response, signal);
  }

  // ==========================================================================
  // Compile Methods
  // ==========================================================================

  /**
   * Compile an Arduino sketch
   * Returns an async generator that yields SSE events
   */
  async *compileSketch(
    request: CompileRequest,
    signal?: AbortSignal
  ): AsyncGenerator<CompileSSEEvent> {
    const response = await fetch(`${this.baseUrl}/compile`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Compile failed: ${response.status}`);
    }

    yield* parseSSEStream<CompileSSEEvent>(response, signal);
  }

  /**
   * Compile and upload an Arduino sketch to a connected board
   * Returns an async generator that yields SSE events
   */
  async *uploadSketch(
    request: UploadSketchRequest,
    signal?: AbortSignal
  ): AsyncGenerator<UploadSketchSSEEvent> {
    const response = await fetch(`${this.baseUrl}/upload-sketch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Upload failed: ${response.status}`);
    }

    yield* parseSSEStream<UploadSketchSSEEvent>(response, signal);
  }

  /**
   * Get list of all available boards
   */
  async getBoards(): Promise<{ boards: BoardInfo[] }> {
    const response = await fetch(`${this.baseUrl}/boards`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to get boards: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Get list of connected boards with auto-detected FQBN
   */
  async getConnectedBoards(): Promise<ConnectedBoard[]> {
    const response = await fetch(`${this.baseUrl}/boards/connected`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to get connected boards: ${response.status}`);
    }

    return response.json();
  }

  // ==========================================================================
  // Filesystem Methods
  // ==========================================================================

  /**
   * List directory contents recursively
   */
  async listDirectory(path: string): Promise<FileEntry[]> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${this.baseUrl}/fs/list?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to list directory: ${response.status}`);
    }

    const data = await response.json();
    return data.files;
  }

  /**
   * Read file contents
   */
  async readFile(path: string): Promise<FileReadResult> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${this.baseUrl}/fs/read?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to read file: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Write file contents
   */
  async writeFile(path: string, content: string): Promise<FileWriteResult> {
    const response = await fetch(`${this.baseUrl}/fs/write`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ path, content }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to write file: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Create a new file or directory
   */
  async createEntry(path: string, type: 'file' | 'directory'): Promise<void> {
    const response = await fetch(`${this.baseUrl}/fs/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({ path, type }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to create ${type}: ${response.status}`);
    }
  }

  /**
   * Delete a file or directory
   */
  async deleteEntry(path: string): Promise<void> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${this.baseUrl}/fs/delete?${params}`, {
      method: 'DELETE',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to delete: ${response.status}`);
    }
  }

  /**
   * Validate an Arduino sketch directory
   */
  async validateSketch(path: string): Promise<SketchInfo> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${this.baseUrl}/fs/validate-sketch?${params}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `Failed to validate sketch: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Watch a directory for file changes
   * Returns an async generator that yields SSE events
   */
  async *watchDirectory(
    path: string,
    signal?: AbortSignal
  ): AsyncGenerator<FileWatchSSEEvent> {
    const params = new URLSearchParams({ path });
    const response = await fetch(`${this.baseUrl}/fs/watch?${params}`, {
      method: 'GET',
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to watch directory: ${response.status}`);
    }

    yield* parseSSEStream<FileWatchSSEEvent>(response, signal);
  }

  /**
   * Get the WebSocket URL for LSP connection
   */
  getLspWebSocketUrl(sketchPath?: string): string {
    const wsBase = this.baseUrl.replace(/^http/, 'ws');
    const params = sketchPath ? `?sketchPath=${encodeURIComponent(sketchPath)}` : '';
    return `${wsBase}/lsp${params}`;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let daemonClientInstance: DaemonClient | null = null;

export function getDaemonClient(): DaemonClient {
  if (!daemonClientInstance) {
    daemonClientInstance = new DaemonClient();
  }
  return daemonClientInstance;
}
