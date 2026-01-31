"use client";

import { useEditorStore } from "@/lib/state";
import { useProjectStore } from "@/lib/project-state";
import dynamic from "next/dynamic";
import { useEffect, useCallback, useRef } from "react";
import { EditorTabs, EditorTabsEmpty } from "@/components/editor-tabs";

const MonacoEditor = dynamic(
  () => import("./monaco").then((mod) => mod.MonacoEditor),
  { ssr: false }
);

// Auto-save delay in milliseconds
const AUTO_SAVE_DELAY = 1000;

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
  const getDiagnostics = useEditorStore((s) => s.getDiagnostics);

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
  const activeDiagnostics = activeFilePath ? getDiagnostics(activeFilePath) : [];

  // Initialize LSP when sketch path changes
  useEffect(() => {
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

  // Open document in LSP when file is opened
  useEffect(() => {
    if (!lspClient || !activeFilePath || !activeFile) return;

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
          notifyDocumentSaved(filePath);
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

      // Update in LSP
      updateDocument(activeFilePath, newCode);

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
      notifyDocumentSaved(activeFilePath);
    } catch (error) {
      console.error("Failed to save file:", error);
    }
  }, [activeFilePath, saveFile, notifyDocumentSaved]);

  // Handle tab close - also close in LSP
  const handleCloseTab = useCallback(
    (path: string) => {
      // Save before closing if there are unsaved changes
      if (hasUnsavedChanges(path)) {
        saveFile(path).then(() => {
          notifyDocumentSaved(path);
        }).catch(console.error);
      }
      
      closeFile(path);
      closeDocument(path);
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
            lspClient={lspClient ?? undefined}
            filePath={activeFilePath!}
            code={activeFile.content}
            diagnostics={activeDiagnostics}
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
