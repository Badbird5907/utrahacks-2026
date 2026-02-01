"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FolderOpen, X, Check, Upload, MoreVertical, Sparkles } from "lucide-react";
import { Editor } from "@/components/editor/index";
import { FileTree, FileTreeHeader } from "@/components/file-tree";
import { OpenProjectDialog } from "@/components/open-project-dialog";
import { InputDialog } from "@/components/input-dialog";
import { CompileOutputPanel } from "@/components/compile-output-panel";
import { AIChatPanel } from "@/components/ai-chat/ai-chat-panel";
import { useProjectStore } from "@/lib/project-state";
import { useEditorStore } from "@/lib/state";
import { useDaemonStore } from "@/lib/daemon-state";
import { Button } from "@/components/ui/button";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { FileEntry } from "@/lib/daemon-client";

export default function Home() {
  const [isOpenProjectDialogOpen, setIsOpenProjectDialogOpen] = useState(false);
  const [showOutputPanel, setShowOutputPanel] = useState(false);
  const [showAIChat, setShowAIChat] = useState(false);
  
  // Dialog states for file/folder creation
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [createParentPath, setCreateParentPath] = useState<string>("");
  
  // Delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<FileEntry | null>(null);

  // Rename dialog
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [entryToRename, setEntryToRename] = useState<FileEntry | null>(null);

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
  const renameEntry = useProjectStore((s) => s.renameEntry);
  const closeProject = useProjectStore((s) => s.closeProject);
  const refreshFileTree = useProjectStore((s) => s.refreshFileTree);
  const saveAllFiles = useProjectStore((s) => s.saveAllFiles);
  const hasUnsavedChanges = useProjectStore((s) => s.hasUnsavedChanges);
  const restoreFromStorage = useProjectStore((s) => s.restoreFromStorage);

  // Editor state
  const notifyDocumentSaved = useEditorStore((s) => s.notifyDocumentSaved);
  const isLspConnected = useEditorStore((s) => s.isLspConnected);
  const isLspInitializing = useEditorStore((s) => s.isLspInitializing);

  // Daemon/compile state
  const compileStatus = useDaemonStore((s) => s.compileStatus);
  const compileSketch = useDaemonStore((s) => s.compileSketch);
  const uploadSketch = useDaemonStore((s) => s.uploadSketch);
  const daemonStatus = useDaemonStore((s) => s.status);

  // Restore project from localStorage on mount
  useEffect(() => {
    restoreFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous error to show toast only when error changes
  const prevErrorRef = useRef<string | null>(null);
  
  // Show toast when error occurs
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      toast.error("Error", { description: error });
    }
    prevErrorRef.current = error;
  }, [error]);

  // Handlers
  const handleSelectFile = useCallback(
    (entry: FileEntry) => {
      if (entry.type === "file") {
        openFile(entry.path);
      }
    },
    [openFile]
  );

  // Request to create file - opens dialog
  const handleRequestCreateFile = useCallback((parentPath: string) => {
    setCreateParentPath(parentPath);
    setNewFileDialogOpen(true);
  }, []);

  // Request to create folder - opens dialog
  const handleRequestCreateFolder = useCallback((parentPath: string) => {
    setCreateParentPath(parentPath);
    setNewFolderDialogOpen(true);
  }, []);

  // Actually create the file
  const handleCreateFile = useCallback(
    async (fileName: string) => {
      if (createParentPath) {
        await createFile(createParentPath, fileName);
      }
    },
    [createParentPath, createFile]
  );

  // Actually create the folder
  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      if (createParentPath) {
        await createFolder(createParentPath, folderName);
      }
    },
    [createParentPath, createFolder]
  );

  // Request delete - opens confirmation dialog
  const handleRequestDelete = useCallback((entry: FileEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  }, []);

  // Actually delete the entry
  const handleConfirmDelete = useCallback(async () => {
    if (entryToDelete) {
      await deleteEntry(entryToDelete.path);
      setEntryToDelete(null);
    }
  }, [entryToDelete, deleteEntry]);

  // Request rename - opens dialog
  const handleRequestRename = useCallback((entry: FileEntry) => {
    setEntryToRename(entry);
    setRenameDialogOpen(true);
  }, []);

  // Actually rename the entry
  const handleConfirmRename = useCallback(
    async (newName: string) => {
      if (entryToRename) {
        await renameEntry(entryToRename.path, newName);
        setEntryToRename(null);
      }
    },
    [entryToRename, renameEntry]
  );

  // Header button handlers
  const handleNewFileAtRoot = useCallback(() => {
    if (sketchPath) {
      handleRequestCreateFile(sketchPath);
    }
  }, [sketchPath, handleRequestCreateFile]);

  const handleNewFolderAtRoot = useCallback(() => {
    if (sketchPath) {
      handleRequestCreateFolder(sketchPath);
    }
  }, [sketchPath, handleRequestCreateFolder]);

  const handleOpenProject = useCallback(() => {
    setIsOpenProjectDialogOpen(true);
  }, []);

  // Compile the sketch
  const handleCompile = useCallback(async () => {
    if (!sketchPath) return;
    
    // Save all files first
    await saveAllFiles();
    const openFiles = useProjectStore.getState().openFiles;
    for (const file of openFiles) {
      notifyDocumentSaved(file.path);
    }
    
    // Show output panel and start compile
    setShowOutputPanel(true);
    await compileSketch(sketchPath);
  }, [sketchPath, saveAllFiles, notifyDocumentSaved, compileSketch]);

  // Compile and upload the sketch
  const handleUpload = useCallback(async () => {
    if (!sketchPath) return;
    
    // Save all files first
    await saveAllFiles();
    const openFiles = useProjectStore.getState().openFiles;
    for (const file of openFiles) {
      notifyDocumentSaved(file.path);
    }
    
    // Show output panel and start compile + upload
    setShowOutputPanel(true);
    await uploadSketch(sketchPath);
  }, [sketchPath, saveAllFiles, notifyDocumentSaved, uploadSketch]);

  // Show output panel when compile starts
  useEffect(() => {
    if (compileStatus === "compiling") {
      setShowOutputPanel(true);
    }
  }, [compileStatus]);

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

          {sketchPath && (
            <>
              {/* Project dropdown menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleOpenProject}>
                    <FolderOpen className="h-4 w-4 mr-2" />
                    Open Project
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={closeProject}>
                    <X className="h-4 w-4 mr-2" />
                    Close Project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Verify/Compile button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleCompile}
                disabled={compileStatus === "compiling" || daemonStatus !== "connected"}
                title={daemonStatus !== "connected" ? "Daemon not connected" : "Verify/Compile sketch"}
              >
                <Check className="h-4 w-4 mr-2" />
                {compileStatus === "compiling" ? "Compiling..." : "Verify"}
              </Button>

              {/* Upload button - compiles and uploads */}
              <Button
                variant="default"
                size="sm"
                onClick={handleUpload}
                disabled={compileStatus === "compiling" || daemonStatus !== "connected"}
                title={daemonStatus !== "connected" ? "Daemon not connected" : "Compile and upload to board"}
              >
                <Upload className="h-4 w-4 mr-2" />
                {compileStatus === "compiling" ? "Uploading..." : "Upload"}
              </Button>

              {/* AI Chat toggle button */}
              <div className="w-px h-6 bg-border mx-1" />
              <Button
                variant={showAIChat ? "secondary" : "outline"}
                size="sm"
                onClick={() => setShowAIChat(!showAIChat)}
                title="Toggle AI Assistant"
              >
                <Sparkles className="h-4 w-4" />
              </Button>

              {/* <div className="w-px h-6 bg-border mx-1" />

              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAll}
                disabled={!hasUnsavedChanges()}
              >
                <Save className="h-4 w-4 mr-2" />
                Save All
              </Button> */}
            </>
          )}

          {!sketchPath && (
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
          )}
        </div>
      </header>

      {/* Main content */}
      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
        {/* Sidebar - File tree */}
        {sketchPath && fileTree && (
          <>
            <ResizablePanel
              minSize={100}
              maxSize={500}
              className="bg-muted/30"
            >
              <div className="flex flex-col h-full">
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
                      onDelete={handleRequestDelete}
                      onRename={handleRequestRename}
                      onRequestCreateFile={handleRequestCreateFile}
                      onRequestCreateFolder={handleRequestCreateFolder}
                      level={0}
                      mainFileName={sketchInfo?.mainFile}
                    />
                  ))}
                </div>
              </div>
            </ResizablePanel>
            <ResizableHandle />
          </>
        )}

        {/* Editor and Output area */}
        <ResizablePanel defaultSize={showAIChat ? "60%" : "80%"} minSize="30%">
          <ResizablePanelGroup orientation="vertical">
            {/* Editor */}
            <ResizablePanel defaultSize={showOutputPanel ? "70%" : "100%"} minSize="30%">
              <div className="h-full overflow-hidden">
                {isLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-muted-foreground">Loading project...</p>
                  </div>
                ) : (
                  <Editor onOpenProject={handleOpenProject} />
                )}
              </div>
            </ResizablePanel>

            {/* Compile Output Panel */}
            {showOutputPanel && (
              <>
                <ResizableHandle orientation="vertical" />
                <ResizablePanel defaultSize="30%" minSize="10%" maxSize="60%">
                  <CompileOutputPanel
                    className="h-full"
                    onClose={() => setShowOutputPanel(false)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        {/* AI Chat Panel */}
        {showAIChat && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="25%" minSize="15%" maxSize="50%">
              <AIChatPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

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
          <span className={daemonStatus === "connected" ? "text-green-600" : "text-muted-foreground"}>
            Daemon: {daemonStatus}
          </span>
        </div>
      </footer>

      {/* New File Dialog */}
      <InputDialog
        open={newFileDialogOpen}
        onOpenChange={setNewFileDialogOpen}
        title="New File"
        description="Enter a name for the new file"
        label="File name"
        placeholder="example.ino"
        submitLabel="Create"
        onSubmit={handleCreateFile}
      />

      {/* New Folder Dialog */}
      <InputDialog
        open={newFolderDialogOpen}
        onOpenChange={setNewFolderDialogOpen}
        title="New Folder"
        description="Enter a name for the new folder"
        label="Folder name"
        placeholder="src"
        submitLabel="Create"
        onSubmit={handleCreateFolder}
      />

      {/* Rename Dialog */}
      <InputDialog
        open={renameDialogOpen}
        onOpenChange={setRenameDialogOpen}
        title={`Rename ${entryToRename?.type === "directory" ? "folder" : "file"}`}
        description={`Enter a new name for "${entryToRename?.name}"`}
        label="New name"
        placeholder={entryToRename?.name || ""}
        defaultValue={entryToRename?.name || ""}
        submitLabel="Rename"
        onSubmit={handleConfirmRename}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {entryToDelete?.type === "directory" ? "folder" : "file"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{entryToDelete?.name}&quot;?
              {entryToDelete?.type === "directory" && " This will delete all contents inside it."}
              {" "}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
