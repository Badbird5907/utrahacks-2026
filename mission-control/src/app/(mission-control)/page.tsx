"use client";

import { useState, useCallback } from "react";
import { FolderOpen, Save, Upload, X, AlertTriangle } from "lucide-react";
import { Editor } from "@/components/editor/index";
import { FileTree, FileTreeHeader } from "@/components/file-tree";
import { OpenProjectDialog } from "@/components/open-project-dialog";
import { useProjectStore } from "@/lib/project-state";
import { useEditorStore } from "@/lib/state";
import { Button } from "@/components/ui/button";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import type { FileEntry } from "@/lib/daemon-client";

export default function Home() {
  const [isOpenProjectDialogOpen, setIsOpenProjectDialogOpen] = useState(false);

  // Project state
  const sketchPath = useProjectStore((s) => s.sketchPath);
  const sketchInfo = useProjectStore((s) => s.sketchInfo);
  const fileTree = useProjectStore((s) => s.fileTree);
  const isLoading = useProjectStore((s) => s.isLoading);
  const error = useProjectStore((s) => s.error);
  const activeFilePath = useProjectStore((s) => s.activeFilePath);
  const openFile = useProjectStore((s) => s.openFile);
  const createFile = useProjectStore((s) => s.createFile);
  const createFolder = useProjectStore((s) => s.createFolder);
  const deleteEntry = useProjectStore((s) => s.deleteEntry);
  const closeProject = useProjectStore((s) => s.closeProject);
  const refreshFileTree = useProjectStore((s) => s.refreshFileTree);
  const saveFile = useProjectStore((s) => s.saveFile);
  const saveAllFiles = useProjectStore((s) => s.saveAllFiles);
  const hasUnsavedChanges = useProjectStore((s) => s.hasUnsavedChanges);

  // Editor state
  const notifyDocumentSaved = useEditorStore((s) => s.notifyDocumentSaved);
  const isLspConnected = useEditorStore((s) => s.isLspConnected);
  const isLspInitializing = useEditorStore((s) => s.isLspInitializing);

  // Handlers
  const handleSelectFile = useCallback(
    (entry: FileEntry) => {
      if (entry.type === "file") {
        openFile(entry.path);
      }
    },
    [openFile]
  );

  const handleDeleteEntry = useCallback(
    async (entry: FileEntry) => {
      if (confirm(`Are you sure you want to delete "${entry.name}"?`)) {
        await deleteEntry(entry.path);
      }
    },
    [deleteEntry]
  );

  const handleCreateFile = useCallback(
    async (parentPath: string, fileName: string) => {
      await createFile(parentPath, fileName);
    },
    [createFile]
  );

  const handleCreateFolder = useCallback(
    async (parentPath: string, folderName: string) => {
      await createFolder(parentPath, folderName);
    },
    [createFolder]
  );

  const handleNewFileAtRoot = useCallback(() => {
    if (!sketchPath) return;
    const fileName = prompt("Enter file name:");
    if (fileName) {
      createFile(sketchPath, fileName);
    }
  }, [sketchPath, createFile]);

  const handleNewFolderAtRoot = useCallback(() => {
    if (!sketchPath) return;
    const folderName = prompt("Enter folder name:");
    if (folderName) {
      createFolder(sketchPath, folderName);
    }
  }, [sketchPath, createFolder]);

  const handleSaveAll = useCallback(async () => {
    await saveAllFiles();
    // Notify LSP for each saved file
    const openFiles = useProjectStore.getState().openFiles;
    for (const file of openFiles) {
      notifyDocumentSaved(file.path);
    }
  }, [saveAllFiles, notifyDocumentSaved]);

  const handleOpenProject = useCallback(() => {
    setIsOpenProjectDialogOpen(true);
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold">Mission Control</h1>
          {sketchInfo && (
            <span className="text-sm text-muted-foreground">
              {sketchInfo.sketchName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* LSP Status indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
            <span
              className={`h-2 w-2 rounded-full ${
                isLspConnected
                  ? "bg-green-500"
                  : isLspInitializing
                  ? "bg-yellow-500 animate-pulse"
                  : "bg-gray-400"
              }`}
            />
            <span>
              {isLspConnected
                ? "LSP Connected"
                : isLspInitializing
                ? "LSP Connecting..."
                : "LSP Disconnected"}
            </span>
          </div>

          <OpenProjectDialog
            trigger={
              <Button variant="outline" size="sm">
                <FolderOpen className="h-4 w-4 mr-2" />
                Open Project
              </Button>
            }
            open={isOpenProjectDialogOpen}
            onOpenChange={setIsOpenProjectDialogOpen}
          />

          {sketchPath && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAll}
                disabled={!hasUnsavedChanges()}
              >
                <Save className="h-4 w-4 mr-2" />
                Save All
              </Button>

              <Button variant="outline" size="sm" onClick={closeProject}>
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Error alert */}
      {error && (
        <Alert variant="destructive" className="mx-4 mt-2">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Main content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Sidebar - File tree */}
        {sketchPath && fileTree && (
          <aside className="w-64 border-r border-border flex flex-col shrink-0 bg-muted/30">
            <FileTreeHeader
              directoryName={sketchInfo?.sketchName || "Project"}
              onRefresh={refreshFileTree}
              onNewFile={handleNewFileAtRoot}
              onNewFolder={handleNewFolderAtRoot}
            />
            <div className="flex-1 overflow-auto p-2">
              {fileTree.map((entry) => (
                <FileTree
                  key={entry.path}
                  entry={entry}
                  selectedPath={activeFilePath}
                  onSelect={handleSelectFile}
                  onDelete={handleDeleteEntry}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  level={0}
                />
              ))}
            </div>
          </aside>
        )}

        {/* Editor area */}
        <main className="flex-1 min-w-0 overflow-hidden">
          {isLoading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-muted-foreground">Loading project...</p>
            </div>
          ) : (
            <Editor onOpenProject={handleOpenProject} />
          )}
        </main>
      </div>

      {/* Status bar */}
      <footer className="flex items-center justify-between border-t border-border px-4 py-1 text-xs text-muted-foreground shrink-0">
        <div className="flex items-center gap-4">
          {sketchPath && (
            <span className="truncate max-w-md" title={sketchPath}>
              {sketchPath}
            </span>
          )}
        </div>
        <div className="flex items-center gap-4">
          {hasUnsavedChanges() && (
            <span className="text-primary">Unsaved changes</span>
          )}
        </div>
      </footer>
    </div>
  );
}
