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

interface TextChange {
  range: {
    start: Position;
    end: Position;
  };
  text: string;
}

function offsetToPosition(text: string, offset: number): Position {
  let line = 0;
  let character = 0;
  
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === '\n') {
      line++;
      character = 0;
    } else {
      character++;
    }
  }
  
  return { line, character };
}

function computeTextChanges(oldText: string, newText: string): TextChange[] {
  if (oldText === newText) {
    return [];
  }
  
  // Find the first differing character
  let start = 0;
  const minLen = Math.min(oldText.length, newText.length);
  while (start < minLen && oldText[start] === newText[start]) {
    start++;
  }
  
  // Find the last differing character (from the end)
  let oldEnd = oldText.length;
  let newEnd = newText.length;
  while (
    oldEnd > start &&
    newEnd > start &&
    oldText[oldEnd - 1] === newText[newEnd - 1]
  ) {
    oldEnd--;
    newEnd--;
  }
  
  // Calculate positions
  const startPos = offsetToPosition(oldText, start);
  const endPos = offsetToPosition(oldText, oldEnd);
  const insertedText = newText.slice(start, newEnd);
  
  return [{
    range: {
      start: startPos,
      end: endPos,
    },
    text: insertedText,
  }];
}

function pathToUri(filePath: string): string {
  // Normalize path separators
  let normalized = filePath.replace(/\\/g, '/');
  
  // Handle Windows drive letters (C:/ -> /C:/)
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = '/' + normalized;
  }
  
  return `file://${normalized}`;
}

function normalizePath(filePath: string): string {
  let normalized = filePath.replace(/\\/g, '/');
  // Normalize Windows drive letter to uppercase
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return normalized;
}

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
  
  // Unique instance ID for debugging
  private instanceId = Math.random().toString(36).slice(2, 8);

  constructor(private wsUrl: string, sketchPath: string) {
    super();
    this.sketchPath = sketchPath;
    this.rootUri = pathToUri(sketchPath);
    console.log(`[LSP-${this.instanceId}] Created new client for ${sketchPath}`);
  }

  public requestNotification(notifications: LspClientNotifications): void {
    this.notifications = notifications;
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    console.log(`[LSP-${this.instanceId}] Initializing...`);
    this.notifications.onWaitingForInitialization?.(true);

    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);

      this.ws.onopen = async () => {
        console.log(`[LSP-${this.instanceId}] WebSocket connected`);
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
                  dynamicRegistration: false,
                  willSave: false,
                  willSaveWaitUntil: false,
                  didSave: true,
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
          console.log(`[LSP-${this.instanceId}] Initialization complete`);
          this.notifications.onWaitingForInitialization?.(false);
          resolve();
        } catch (error) {
          console.error(`[LSP-${this.instanceId}] Initialization failed:`, error);
          reject(error);
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.ws.onerror = (error) => {
        console.error(`[LSP-${this.instanceId}] WebSocket error:`, error);
        this.notifications.onError?.("WebSocket connection error");
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = (event) => {
        console.log(`[LSP-${this.instanceId}] WebSocket closed:`, event.code, event.reason);
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
            console.error(`[LSP-${this.instanceId}] Request error:`, message.error);
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
      console.error(`[LSP-${this.instanceId}] Failed to parse message:`, error);
    }
  }

  private handleNotification(method: string, params: unknown): void {
    if (method === "textDocument/publishDiagnostics") {
      const diagnosticParams = params as {
        uri: string;
        diagnostics: Diagnostic[];
      };
      console.log(`[LSP-${this.instanceId}] Diagnostics for:`, diagnosticParams.uri, 'count:', diagnosticParams.diagnostics.length);
      // Forward diagnostics for any open document
      this.notifications.onDiagnostics?.(diagnosticParams.diagnostics, diagnosticParams.uri);
    } else {
      console.log(`[LSP-${this.instanceId}] Notification:`, method);
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

  public openDocument(filePath: string, content: string): void {
    if (!this.initialized) {
      console.warn(`[LSP-${this.instanceId}] Cannot open document - not initialized`);
      return;
    }

    // Normalize path for consistent storage
    const normalizedPath = normalizePath(filePath);
    const uri = pathToUri(filePath);
    
    // Check if already open
    if (this.openDocuments.has(normalizedPath)) {
      console.log(`[LSP-${this.instanceId}] Document already open:`, normalizedPath);
      return;
    }

    console.log(`[LSP-${this.instanceId}] Opening document:`, normalizedPath, 'uri:', uri);

    const doc: OpenDocument = {
      uri,
      version: 0,
      content,
    };
    this.openDocuments.set(normalizedPath, doc);

    this.sendNotification("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: getLanguageId(filePath),
        version: doc.version,
        text: content,
      },
    });
  }

  public closeDocument(filePath: string): void {
    if (!this.initialized) return;

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) return;

    console.log(`[LSP-${this.instanceId}] Closing document:`, normalizedPath);

    this.sendNotification("textDocument/didClose", {
      textDocument: { uri: doc.uri },
    });

    this.openDocuments.delete(normalizedPath);
  }

  public updateDocument(filePath: string, content: string): void {
    if (!this.initialized) {
      console.warn(`[LSP-${this.instanceId}] Cannot update document - not initialized`);
      return;
    }

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) {
      // Auto-open if not open
      console.log(`[LSP-${this.instanceId}] Document not open, auto-opening:`, normalizedPath);
      this.openDocument(filePath, content);
      return;
    }

    // Compute incremental changes between old and new content
    const changes = computeTextChanges(doc.content, content);
    
    if (changes.length === 0) {
      // No actual changes, skip the notification
      return;
    }

    doc.version++;
    doc.content = content;

    this.sendNotification("textDocument/didChange", {
      textDocument: {
        uri: doc.uri,
        version: doc.version,
      },
      contentChanges: changes,
    });
  }

  public notifyDocumentSaved(filePath: string): void {
    if (!this.initialized) return;

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) return;

    this.sendNotification("textDocument/didSave", {
      textDocument: { uri: doc.uri },
      text: doc.content,
    });
  }

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

  public async getHoverInfo(
    filePath: string,
    position: Position
  ): Promise<Hover | null> {
    if (!this.initialized) {
      console.warn(`[LSP-${this.instanceId}] getHoverInfo - not initialized`);
      return null;
    }

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) {
      console.warn(`[LSP-${this.instanceId}] getHoverInfo - document not open:`, normalizedPath);
      console.log(`[LSP-${this.instanceId}] Open documents:`, Array.from(this.openDocuments.keys()));
      return null;
    }

    try {
      const result = await this.sendRequest("textDocument/hover", {
        textDocument: { uri: doc.uri },
        position,
      });
      return result as Hover | null;
    } catch (error) {
      console.error(`[LSP-${this.instanceId}] getHoverInfo failed:`, error);
      return null;
    }
  }

  public async getRenameEdits(
    filePath: string,
    position: Position,
    newName: string
  ): Promise<WorkspaceEdit | null> {
    if (!this.initialized) return null;

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) {
      console.warn(`[LSP-${this.instanceId}] getRenameEdits - document not open:`, normalizedPath);
      return null;
    }

    try {
      const result = await this.sendRequest("textDocument/rename", {
        textDocument: { uri: doc.uri },
        position,
        newName,
      });
      return result as WorkspaceEdit | null;
    } catch (error) {
      console.error(`[LSP-${this.instanceId}] getRenameEdits failed:`, error);
      return null;
    }
  }

  public async getSignatureHelp(
    filePath: string,
    position: Position
  ): Promise<SignatureHelp | null> {
    if (!this.initialized) return null;

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) {
      console.warn(`[LSP-${this.instanceId}] getSignatureHelp - document not open:`, normalizedPath);
      return null;
    }

    try {
      const result = await this.sendRequest("textDocument/signatureHelp", {
        textDocument: { uri: doc.uri },
        position,
      });
      return result as SignatureHelp | null;
    } catch (error) {
      console.error(`[LSP-${this.instanceId}] getSignatureHelp failed:`, error);
      return null;
    }
  }

  public async getCompletion(
    filePath: string,
    position: Position
  ): Promise<CompletionList | CompletionItem[] | null> {
    if (!this.initialized) {
      console.warn(`[LSP-${this.instanceId}] getCompletion - not initialized`);
      return null;
    }

    const normalizedPath = normalizePath(filePath);
    const doc = this.openDocuments.get(normalizedPath);
    if (!doc) {
      console.warn(`[LSP-${this.instanceId}] getCompletion - document not open:`, normalizedPath);
      console.log(`[LSP-${this.instanceId}] Open documents:`, Array.from(this.openDocuments.keys()));
      return null;
    }

    try {
      console.log(`[LSP-${this.instanceId}] Requesting completion at`, position, 'for', doc.uri);
      const result = await this.sendRequest("textDocument/completion", {
        textDocument: { uri: doc.uri },
        position,
      });
      console.log(`[LSP-${this.instanceId}] Completion result:`, result ? 'received' : 'null');
      return result as CompletionList | CompletionItem[] | null;
    } catch (error) {
      console.error(`[LSP-${this.instanceId}] getCompletion failed:`, error);
      return null;
    }
  }

  /**
   * Resolve completion item details.
   * Note: Arduino Language Server does NOT support this method and will panic if called.
   * We simply return the original item as-is.
   */
  public async resolveCompletion(
    completionItem: CompletionItem
  ): Promise<CompletionItem | null> {
    // Arduino LSP doesn't implement completionItem/resolve - it panics with "unimplemented"
    // Just return the original item without making the LSP call
    return completionItem;
  }

  public disconnect(): void {
    console.log(`[LSP-${this.instanceId}] Disconnecting...`);
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

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getSketchPath(): string {
    return this.sketchPath;
  }

  public isDocumentOpen(filePath: string): boolean {
    const normalizedPath = normalizePath(filePath);
    return this.openDocuments.has(normalizedPath);
  }
}
