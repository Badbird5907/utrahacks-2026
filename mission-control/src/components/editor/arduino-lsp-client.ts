import {
  CompletionItem,
  CompletionList,
  Diagnostic,
  Hover,
  Position,
  SignatureHelp,
  WorkspaceEdit,
} from "vscode-languageserver-types";
import { LspClient, LspClientNotifications } from "./lsp-client";

interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

interface OpenDocument {
  uri: string;
  version: number;
  content: string;
}

/**
 * Convert a file path to a file:// URI
 * Handles both Windows (C:\path) and Unix (/path) paths
 */
function pathToUri(filePath: string): string {
  // Normalize path separators
  let normalized = filePath.replace(/\\/g, '/');
  
  // Handle Windows drive letters (C:/ -> /C:/)
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = '/' + normalized;
  }
  
  return `file://${normalized}`;
}

/**
 * Get language ID from file extension
 */
function getLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ino':
    case 'cpp':
    case 'cc':
    case 'cxx':
      return 'cpp';
    case 'c':
      return 'c';
    case 'h':
    case 'hpp':
    case 'hh':
    case 'hxx':
      return 'cpp';  // Headers are typically processed as C++
    default:
      return 'cpp';
  }
}

export class ArduinoLspClient extends LspClient<never> {
  private ws: WebSocket | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, PendingRequest>();
  private notifications: LspClientNotifications = {};
  private initialized = false;
  
  // Multi-document support
  private openDocuments = new Map<string, OpenDocument>();  // path -> document
  private sketchPath: string;
  private rootUri: string;

  constructor(private wsUrl: string, sketchPath: string) {
    super();
    this.sketchPath = sketchPath;
    this.rootUri = pathToUri(sketchPath);
  }

  public requestNotification(notifications: LspClientNotifications): void {
    this.notifications = notifications;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    this.notifications.onWaitingForInitialization?.(true);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = async () => {
        try {
          // Send initialize request with proper rootUri
          await this.sendRequest("initialize", {
            processId: null,
            capabilities: {
              textDocument: {
                hover: { contentFormat: ["markdown", "plaintext"] },
                completion: {
                  completionItem: {
                    snippetSupport: true,
                    documentationFormat: ["markdown", "plaintext"],
                  },
                },
                signatureHelp: {
                  signatureInformation: {
                    documentationFormat: ["markdown", "plaintext"],
                  },
                },
                publishDiagnostics: { relatedInformation: true },
                synchronization: {
                  didSave: true,
                  willSave: false,
                  willSaveWaitUntil: false,
                },
              },
              workspace: {
                workspaceFolders: true,
              },
            },
            rootUri: this.rootUri,
            workspaceFolders: [{
              uri: this.rootUri,
              name: this.sketchPath.split('/').pop() || this.sketchPath.split('\\').pop() || 'sketch',
            }],
          });

          // Send initialized notification
          this.sendNotification("initialized", {});

          this.initialized = true;
          this.notifications.onWaitingForInitialization?.(false);
          resolve();
        } catch (error) {
          reject(error);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        this.notifications.onError?.("WebSocket connection error");
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this.initialized = false;
        this.openDocuments.clear();
        // Reject all pending requests
        for (const [, pending] of this.pendingRequests) {
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      };
    });
  }

  private handleMessage(data: string): void {
    try {
      const message: JsonRpcMessage = JSON.parse(data);

      // Handle response to a request
      if (message.id !== undefined && !message.method) {
        const pending = this.pendingRequests.get(message.id);
        if (pending) {
          this.pendingRequests.delete(message.id);
          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }

      // Handle server notifications
      if (message.method) {
        this.handleNotification(message.method, message.params);
      }
    } catch (error) {
      console.error("Failed to parse LSP message:", error);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (method === "textDocument/publishDiagnostics") {
      const diagnosticParams = params as {
        uri: string;
        diagnostics: Diagnostic[];
      };
      // Forward diagnostics for any open document
      this.notifications.onDiagnostics?.(diagnosticParams.diagnostics, diagnosticParams.uri);
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error("WebSocket not connected"));
        return;
      }

      const id = ++this.requestId;
      const message: JsonRpcMessage = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      this.pendingRequests.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(message));
    });
  }

  private sendNotification(method: string, params: unknown): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const message: JsonRpcMessage = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.ws.send(JSON.stringify(message));
  }

  // ============================================================================
  // Document Management (Multi-file)
  // ============================================================================

  /**
   * Open a document in the LSP
   */
  public openDocument(filePath: string, content: string): void {
    if (!this.initialized) return;

    const uri = pathToUri(filePath);
    
    // Check if already open
    if (this.openDocuments.has(filePath)) {
      return;
    }

    const doc: OpenDocument = {
      uri,
      version: 0,
      content,
    };
    this.openDocuments.set(filePath, doc);

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: getLanguageId(filePath),
        version: doc.version,
        text: content,
      },
    });
  }

  /**
   * Close a document in the LSP
   */
  public closeDocument(filePath: string): void {
    if (!this.initialized) return;

    const doc = this.openDocuments.get(filePath);
    if (!doc) return;

    this.sendNotification("textDocument/didClose", {
      textDocument: { uri: doc.uri },
    });

    this.openDocuments.delete(filePath);
  }

  /**
   * Update document content
   */
  public updateDocument(filePath: string, content: string): void {
    if (!this.initialized) return;

    const doc = this.openDocuments.get(filePath);
    if (!doc) {
      // Auto-open if not open
      this.openDocument(filePath, content);
      return;
    }

    doc.version++;
    doc.content = content;

    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri: doc.uri,
        version: doc.version,
      },
      contentChanges: [{ text: content }],
    });
  }

  /**
   * Notify LSP that a document was saved
   */
  public notifyDocumentSaved(filePath: string): void {
    if (!this.initialized) return;

    const doc = this.openDocuments.get(filePath);
    if (!doc) return;

    this.sendNotification("textDocument/didSave", {
      textDocument: { uri: doc.uri },
      text: doc.content,
    });
  }

  // ============================================================================
  // Legacy single-file methods (for compatibility)
  // ============================================================================

  public updateCode(code: string): void {
    // Legacy method - no-op, use updateDocument instead
    console.warn('updateCode is deprecated, use updateDocument instead');
  }

  public async updateTextDocument(code: string): Promise<number> {
    // Legacy method - no-op, use updateDocument instead
    console.warn('updateTextDocument is deprecated, use updateDocument instead');
    return 0;
  }

  public async updateSettings(): Promise<void> {
    // Arduino LSP may not need settings updates
  }

  // ============================================================================
  // LSP Feature Methods
  // ============================================================================

  public async getHoverInfo(
    filePath: string,
    position: Position
  ): Promise<Hover | null> {
    if (!this.initialized) return null;

    const doc = this.openDocuments.get(filePath);
    if (!doc) return null;

    try {
      const result = await this.sendRequest("textDocument/hover", {
        textDocument: { uri: doc.uri },
        position,
      });
      return result as Hover | null;
    } catch {
      return null;
    }
  }

  public async getRenameEdits(
    filePath: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    if (!this.initialized) return null;

    const doc = this.openDocuments.get(filePath);
    if (!doc) return null;

    try {
      const result = await this.sendRequest("textDocument/rename", {
        textDocument: { uri: doc.uri },
        position,
        newName,
      });
      return result as WorkspaceEdit | null;
    } catch {
      return null;
    }
  }

  public async getSignatureHelp(
    filePath: string,
    position: Position
  ): Promise<SignatureHelp | null> {
    if (!this.initialized) return null;

    const doc = this.openDocuments.get(filePath);
    if (!doc) return null;

    try {
      const result = await this.sendRequest("textDocument/signatureHelp", {
        textDocument: { uri: doc.uri },
        position,
      });
      return result as SignatureHelp | null;
    } catch {
      return null;
    }
  }

  public async getCompletion(
    filePath: string,
    position: Position
  ): Promise<CompletionList | CompletionItem[] | null> {
    if (!this.initialized) return null;

    const doc = this.openDocuments.get(filePath);
    if (!doc) return null;

    try {
      const result = await this.sendRequest("textDocument/completion", {
        textDocument: { uri: doc.uri },
        position,
      });
      return result as CompletionList | CompletionItem[] | null;
    } catch {
      return null;
    }
  }

  public async resolveCompletion(
    completionItem: CompletionItem
  ): Promise<CompletionItem | null> {
    if (!this.initialized) return null;

    try {
      const result = await this.sendRequest(
        "completionItem/resolve",
        completionItem
      );
      return result as CompletionItem | null;
    } catch {
      return null;
    }
  }

  public disconnect(): void {
    if (this.ws) {
      // Close all open documents first
      for (const filePath of this.openDocuments.keys()) {
        this.closeDocument(filePath);
      }
      
      this.ws.close();
      this.ws = null;
    }
    this.initialized = false;
    this.openDocuments.clear();
  }

  // ============================================================================
  // Getters
  // ============================================================================

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getSketchPath(): string {
    return this.sketchPath;
  }

  public isDocumentOpen(filePath: string): boolean {
    return this.openDocuments.has(filePath);
  }
}
