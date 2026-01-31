import { create } from "zustand";
import { Diagnostic } from "vscode-languageserver-types";
import { ArduinoLspClient } from "@/components/editor/arduino-lsp-client";
import { getDaemonClient } from "./daemon-client";

interface EditorState {
  // LSP state
  lspClient: ArduinoLspClient | null;
  isLspConnected: boolean;
  isLspInitializing: boolean;
  
  // Diagnostics per file (path -> diagnostics)
  diagnosticsMap: Map<string, Diagnostic[]>;
  
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
  diagnosticsMap: new Map(),
  
  initializeLsp: async (sketchPath: string) => {
    const { lspClient: existingClient, isLspInitializing, disconnectLsp } = get();
    
    // If already connected to a different sketch, disconnect first
    if (existingClient) {
      if (existingClient.getSketchPath() === sketchPath) {
        // Already connected to this sketch
        return;
      }
      disconnectLsp();
    }
    
    if (isLspInitializing) return;
    
    set({ isLspInitializing: true, diagnosticsMap: new Map() });
    
    // Get WebSocket URL from daemon client
    const daemonClient = getDaemonClient();
    const wsUrl = daemonClient.getLspWebSocketUrl(sketchPath);
    
    const client = new ArduinoLspClient(wsUrl, sketchPath);
    
    client.requestNotification({
      onWaitingForInitialization: (isWaiting) => {
        set({ isLspInitializing: isWaiting });
      },
      onDiagnostics: (diagnostics, uri) => {
        set((state) => {
          const newMap = new Map(state.diagnosticsMap);
          // Convert URI back to path for storage
          if (uri) {
            // Extract path from file:// URI
            let filePath = uri.replace(/^file:\/\//, '');
            // Handle Windows paths (file:///C:/... -> C:/...)
            if (filePath.startsWith('/') && /^\/[a-zA-Z]:\//.test(filePath)) {
              filePath = filePath.slice(1);
            }
            newMap.set(filePath, diagnostics);
          }
          return { diagnosticsMap: newMap };
        });
      },
      onError: (message) => {
        console.error("LSP Error:", message);
      },
    });
    
    try {
      await client.initialize();
      set({ lspClient: client, isLspConnected: true, isLspInitializing: false });
    } catch (error) {
      console.error("Failed to initialize LSP:", error);
      set({ isLspInitializing: false, isLspConnected: false, lspClient: null });
    }
  },
  
  disconnectLsp: () => {
    const { lspClient } = get();
    if (lspClient) {
      lspClient.disconnect();
    }
    set({ 
      lspClient: null, 
      isLspConnected: false, 
      diagnosticsMap: new Map() 
    });
  },
  
  openDocument: (filePath: string, content: string) => {
    const { lspClient } = get();
    if (lspClient) {
      lspClient.openDocument(filePath, content);
    }
  },
  
  closeDocument: (filePath: string) => {
    const { lspClient } = get();
    if (lspClient) {
      lspClient.closeDocument(filePath);
    }
    // Clear diagnostics for this file
    set((state) => {
      const newMap = new Map(state.diagnosticsMap);
      newMap.delete(filePath);
      return { diagnosticsMap: newMap };
    });
  },
  
  updateDocument: (filePath: string, content: string) => {
    const { lspClient } = get();
    if (lspClient) {
      lspClient.updateDocument(filePath, content);
    }
  },
  
  notifyDocumentSaved: (filePath: string) => {
    const { lspClient } = get();
    if (lspClient) {
      lspClient.notifyDocumentSaved(filePath);
    }
  },
  
  getDiagnostics: (filePath: string) => {
    const { diagnosticsMap } = get();
    return diagnosticsMap.get(filePath) || [];
  },
}));
