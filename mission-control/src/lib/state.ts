import { create } from "zustand";
import { Diagnostic } from "vscode-languageserver-types";
import { ArduinoLspClient } from "@/components/editor/arduino-lsp-client";
import { getDaemonClient } from "./daemon-client";

/**
 * Normalize a file path to use forward slashes consistently
 * Also normalizes Windows drive letters to uppercase for consistent comparison
 */
function normalizePath(path: string): string {
  let normalized = path.replace(/\\/g, '/');
  // Normalize Windows drive letter to uppercase
  if (/^[a-zA-Z]:\//.test(normalized)) {
    normalized = normalized.charAt(0).toUpperCase() + normalized.slice(1);
  }
  return normalized;
}

interface EditorState {
  // LSP state
  lspClient: ArduinoLspClient | null;
  isLspConnected: boolean;
  isLspInitializing: boolean;
  
  // Diagnostics per file (path -> diagnostics)
  // Using a plain object instead of Map for better Zustand reactivity
  diagnosticsMap: Record<string, Diagnostic[]>;
  
  // Actions
  initializeLsp: (sketchPath: string) => Promise<void>;
  disconnectLsp: () => void;
  
  // Document operations
  openDocument: (filePath: string, content: string) => void;
  closeDocument: (filePath: string) => void;
  updateDocument: (filePath: string, content: string) => void;
  notifyDocumentSaved: (filePath: string) => void;
  
  // Diagnostics
  getDiagnostics: (filePath: string) => Diagnostic[];
}

export const useEditorStore = create<EditorState>((set, get) => ({
  lspClient: null,
  isLspConnected: false,
  isLspInitializing: false,
  diagnosticsMap: {},
  
  initializeLsp: async (sketchPath: string) => {
    const { lspClient: existingClient, isLspInitializing, disconnectLsp } = get();
    
    console.log('[State] initializeLsp called with:', sketchPath);
    console.log('[State] existingClient:', existingClient ? 'exists' : 'null');
    console.log('[State] isLspInitializing:', isLspInitializing);
    
    // If already connected to a different sketch, disconnect first
    if (existingClient) {
      if (existingClient.getSketchPath() === sketchPath) {
        // Already connected to this sketch
        console.log('[State] Already connected to this sketch, skipping init');
        return;
      }
      console.log('[State] Different sketch, disconnecting existing client');
      disconnectLsp();
    }
    
    if (isLspInitializing) {
      console.log('[State] Already initializing, skipping');
      return;
    }
    
    console.log('[State] Starting LSP initialization...');
    set({ isLspInitializing: true, diagnosticsMap: {} });
    
    // Get WebSocket URL from daemon client
    const daemonClient = getDaemonClient();
    const wsUrl = daemonClient.getLspWebSocketUrl(sketchPath);
    
    const client = new ArduinoLspClient(wsUrl, sketchPath);
    
    client.requestNotification({
      onWaitingForInitialization: (isWaiting) => {
        set({ isLspInitializing: isWaiting });
      },
      onDiagnostics: (diagnostics, uri) => {
        // Convert URI back to path for storage
        if (uri) {
          // Extract path from file:// URI
          let filePath = uri.replace(/^file:\/\//, '');
          // Handle Windows paths (file:///C:/... -> C:/...)
          if (filePath.startsWith('/') && /^\/[a-zA-Z]:\//.test(filePath)) {
            filePath = filePath.slice(1);
          }
          // Normalize to forward slashes and uppercase drive letter for consistent lookup
          filePath = normalizePath(filePath);
          console.log('[State] Storing diagnostics for:', filePath, 'count:', diagnostics.length);
          
          set((state) => ({
            diagnosticsMap: {
              ...state.diagnosticsMap,
              [filePath]: diagnostics,
            },
          }));
        }
      },
      onError: (message) => {
        console.error("LSP Error:", message);
      },
    });
    
    try {
      await client.initialize();
      console.log('[State] LSP initialized successfully');
      set({ lspClient: client, isLspConnected: true, isLspInitializing: false });
    } catch (error) {
      console.error("[State] Failed to initialize LSP:", error);
      set({ isLspInitializing: false, isLspConnected: false, lspClient: null });
    }
  },
  
  disconnectLsp: () => {
    console.log('[State] disconnectLsp called');
    const { lspClient } = get();
    if (lspClient) {
      lspClient.disconnect();
    }
    set({ 
      lspClient: null, 
      isLspConnected: false, 
      diagnosticsMap: {} 
    });
  },
  
  openDocument: (filePath: string, content: string) => {
    const { lspClient, isLspConnected } = get();
    if (lspClient && isLspConnected) {
      lspClient.openDocument(filePath, content);
    } else {
      console.log('[State] openDocument skipped - LSP not connected');
    }
  },
  
  closeDocument: (filePath: string) => {
    const { lspClient, isLspConnected } = get();
    if (lspClient && isLspConnected) {
      lspClient.closeDocument(filePath);
    }
    // Clear diagnostics for this file (use normalized path)
    const normalizedPath = normalizePath(filePath);
    set((state) => {
      const newDiagnostics = { ...state.diagnosticsMap };
      delete newDiagnostics[normalizedPath];
      return { diagnosticsMap: newDiagnostics };
    });
  },
  
  updateDocument: (filePath: string, content: string) => {
    const { lspClient, isLspConnected } = get();
    if (lspClient && isLspConnected) {
      lspClient.updateDocument(filePath, content);
    }
  },
  
  notifyDocumentSaved: (filePath: string) => {
    const { lspClient, isLspConnected } = get();
    if (lspClient && isLspConnected) {
      lspClient.notifyDocumentSaved(filePath);
    }
  },
  
  getDiagnostics: (filePath: string) => {
    const { diagnosticsMap } = get();
    // Normalize path for consistent lookup
    const normalizedPath = normalizePath(filePath);
    const diagnostics = diagnosticsMap[normalizedPath] || [];
    console.log('[State] Getting diagnostics for:', normalizedPath, 'found:', diagnostics.length);
    return diagnostics;
  },
}));
