"use client";

import { useEditorStore } from "@/lib/state";
import { useProjectStore } from "@/lib/project-state";
import dynamic from "next/dynamic";
import { useEffect, useCallback, useRef, useMemo } from "react";
import { EditorTabs, EditorTabsEmpty } from "@/components/editor-tabs";

const MonacoEditor = dynamic(
  () => import("./monaco").then((mod) => mod.MonacoEditor),
  { ssr: false }
);

// Auto-save delay in milliseconds
const AUTO_SAVE_DELAY = 1000;

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

/**
 * Check if a file is supported by the Arduino LSP (C/C++/Arduino files)
 */
function isLspSupportedFile(filePath: string): boolean {
  const ext = filePath.split('.').pop()?.toLowerCase();
  return ['ino', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'hh', 'hxx'].includes(ext || '');
}

interface EditorProps {
  onOpenProject?: () => void;
}

export const Editor = ({ onOpenProject }: EditorProps) => {
  // Editor/LSP state
  const lspClient = useEditorStore((s) => s.lspClient);
  const initializeLsp = useEditorStore((s) => s.initializeLsp);
  const disconnectLsp = useEditorStore((s) => s.disconnectLsp);
  const openDocument = useEditorStore((s) => s.openDocument);
  const closeDocument = useEditorStore((s) => s.closeDocument);
  const updateDocument = useEditorStore((s) => s.updateDocument);
  const notifyDocumentSaved = useEditorStore((s) => s.notifyDocumentSaved);
  // Subscribe to diagnosticsMap directly for reactivity
  const diagnosticsMap = useEditorStore((s) => s.diagnosticsMap);

  // Project state
  const sketchPath = useProjectStore((s) => s.sketchPath);
  const openFiles = useProjectStore((s) => s.openFiles);
  const activeFilePath = useProjectStore((s) => s.activeFilePath);
  const setActiveFile = useProjectStore((s) => s.setActiveFile);
  const closeFile = useProjectStore((s) => s.closeFile);
  const updateFileContent = useProjectStore((s) => s.updateFileContent);
  const saveFile = useProjectStore((s) => s.saveFile);
  const hasUnsavedChanges = useProjectStore((s) => s.hasUnsavedChanges);
  const getOpenFile = useProjectStore((s) => s.getOpenFile);

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSavePathRef = useRef<string | null>(null);

  // Get active file
  const activeFile = activeFilePath ? getOpenFile(activeFilePath) : undefined;
  
  // Get diagnostics for active file with proper reactivity
  const activeDiagnostics = useMemo(() => {
    if (!activeFilePath) return [];
    const normalizedPath = normalizePath(activeFilePath);
    return diagnosticsMap[normalizedPath] || [];
  }, [activeFilePath, diagnosticsMap]);

  // Initialize LSP when sketch path changes
  useEffect(() => {
    console.log('[Editor] LSP init effect - sketchPath:', sketchPath);
    if (sketchPath) {
      initializeLsp(sketchPath);
    } else {
      disconnectLsp();
    }

    return () => {
      // Don't disconnect on unmount if we still have a sketch open
      // The project state manages the lifecycle
    };
  }, [sketchPath, initializeLsp, disconnectLsp]);

  // Open document in LSP when file is opened (only for supported file types)
  useEffect(() => {
    console.log('[Editor] Document open effect - lspClient:', lspClient ? 'exists' : 'null', 
      'initialized:', lspClient?.isInitialized(), 
      'activeFilePath:', activeFilePath);
    
    if (!lspClient || !activeFilePath || !activeFile) return;

    // Only open C/C++/Arduino files in LSP
    if (!isLspSupportedFile(activeFilePath)) {
      console.log('[Editor] Skipping LSP for non-C/C++ file:', activeFilePath);
      return;
    }

    // Check if LSP is actually initialized
    if (!lspClient.isInitialized()) {
      console.log('[Editor] LSP not initialized yet, skipping document open');
      return;
    }

    // Open document in LSP if not already open
    if (!lspClient.isDocumentOpen(activeFilePath)) {
      openDocument(activeFilePath, activeFile.content);
    }
  }, [lspClient, activeFilePath, activeFile, openDocument]);

  // Cleanup auto-save timer on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Auto-save function
  const triggerAutoSave = useCallback(
    async (filePath: string) => {
      try {
        // Check if file still has unsaved changes (user might have manually saved)
        if (hasUnsavedChanges(filePath)) {
          await saveFile(filePath);
          if (isLspSupportedFile(filePath)) {
            notifyDocumentSaved(filePath);
          }
        }
      } catch (error) {
        console.error("Auto-save failed:", error);
      }
    },
    [saveFile, notifyDocumentSaved, hasUnsavedChanges]
  );

  // Handle code changes with auto-save
  const handleUpdateCode = useCallback(
    (newCode: string) => {
      if (!activeFilePath) return;

      // Update in project store (tracks unsaved changes)
      updateFileContent(activeFilePath, newCode);

      // Update in LSP (only for supported file types)
      if (isLspSupportedFile(activeFilePath)) {
        updateDocument(activeFilePath, newCode);
      }

      // Clear existing auto-save timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set up new auto-save timer
      pendingSavePathRef.current = activeFilePath;
      autoSaveTimerRef.current = setTimeout(() => {
        const pathToSave = pendingSavePathRef.current;
        if (pathToSave) {
          triggerAutoSave(pathToSave);
          pendingSavePathRef.current = null;
        }
      }, AUTO_SAVE_DELAY);
    },
    [activeFilePath, updateFileContent, updateDocument, triggerAutoSave]
  );

  // Handle manual save (Ctrl+S) - also clears auto-save timer
  const handleSave = useCallback(async () => {
    if (!activeFilePath) return;

    // Clear auto-save timer since we're saving manually
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
      pendingSavePathRef.current = null;
    }

    try {
      await saveFile(activeFilePath);
      if (isLspSupportedFile(activeFilePath)) {
        notifyDocumentSaved(activeFilePath);
      }
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [activeFilePath, saveFile, notifyDocumentSaved]);

  // Handle tab close - also close in LSP for supported files
  const handleCloseTab = useCallback(
    (path: string) => {
      // Save before closing if there are unsaved changes
      if (hasUnsavedChanges(path)) {
        saveFile(path).then(() => {
          if (isLspSupportedFile(path)) {
            notifyDocumentSaved(path);
          }
        }).catch(console.error);
      }
      
      closeFile(path);
      if (isLspSupportedFile(path)) {
        closeDocument(path);
      }
    },
    [closeFile, closeDocument, hasUnsavedChanges, saveFile, notifyDocumentSaved]
  );

  // No project open
  if (!sketchPath) {
    return (
      <div className="h-full w-full flex items-center justify-center">
        <EditorTabsEmpty onOpenProject={onOpenProject || (() => {})} />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Tab bar */}
      <EditorTabs
        openFiles={openFiles}
        activeFilePath={activeFilePath}
        onSelectTab={setActiveFile}
        onCloseTab={handleCloseTab}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Editor area */}
      <div className="flex-1 min-h-0">
        {activeFile ? (
          <MonacoEditor
            lspClient={activeFilePath && isLspSupportedFile(activeFilePath) ? lspClient ?? undefined : undefined}
            filePath={activeFilePath!}
            code={activeFile.content}
            diagnostics={activeFilePath && isLspSupportedFile(activeFilePath) ? activeDiagnostics : []}
            onUpdateCode={handleUpdateCode}
            onSave={handleSave}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <p>Select a file from the sidebar to start editing</p>
          </div>
        )}
      </div>
    </div>
  );
};
