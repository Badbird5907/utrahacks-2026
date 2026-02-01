"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { FolderOpen, X, Check, Upload, MoreVertical, Sparkles, Terminal, ChevronDown } from "lucide-react";
import { Editor } from "@/components/editor/index";
import { FileTree, FileTreeHeader } from "@/components/file-tree";
import { OpenProjectDialog } from "@/components/open-project-dialog";
import { InputDialog } from "@/components/input-dialog";
import { OutputPanel } from "@/components/output-panel";
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
  const [outputPanelTab, setOutputPanelTab] = useState<"output" | "serial">("output");
  const [showAIChat, setShowAIChat] = useState(false);
  const [newFileDialogOpen, setNewFileDialogOpen] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [createParentPath, setCreateParentPath] = useState<string>("");
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [entryToDelete, setEntryToDelete] = useState<FileEntry | null>(null);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [entryToRename, setEntryToRename] = useState<FileEntry | null>(null);
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
  const notifyDocumentSaved = useEditorStore((s) => s.notifyDocumentSaved);
  const isLspConnected = useEditorStore((s) => s.isLspConnected);
  const isLspInitializing = useEditorStore((s) => s.isLspInitializing);
  const compileStatus = useDaemonStore((s) => s.compileStatus);
  const compileSketch = useDaemonStore((s) => s.compileSketch);
  const uploadSketch = useDaemonStore((s) => s.uploadSketch);
  const daemonStatus = useDaemonStore((s) => s.status);
  const isSerialMonitorRunning = useDaemonStore((s) => s.isSerialMonitorRunning);
  const serialStatus = useDaemonStore((s) => s.serialStatus);
  useEffect(() => {
    restoreFromStorage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track previous error to show toast only when error changes
  const prevErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      toast.error("Error", { description: error });
    }
    prevErrorRef.current = error;
  }, [error]);
  const handleSelectFile = useCallback(
    (entry: FileEntry) => {
      if (entry.type === "file") {
        openFile(entry.path);
      }
    },
    [openFile]
  );
  const handleRequestCreateFile = useCallback((parentPath: string) => {
    setCreateParentPath(parentPath);
    setNewFileDialogOpen(true);
  }, []);
  const handleRequestCreateFolder = useCallback((parentPath: string) => {
    setCreateParentPath(parentPath);
    setNewFolderDialogOpen(true);
  }, []);
  const handleCreateFile = useCallback(
    async (fileName: string) => {
      if (createParentPath) {
        await createFile(createParentPath, fileName);
      }
    },
    [createParentPath, createFile]
  );
  const handleCreateFolder = useCallback(
    async (folderName: string) => {
      if (createParentPath) {
        await createFolder(createParentPath, folderName);
      }
    },
    [createParentPath, createFolder]
  );
  const handleRequestDelete = useCallback((entry: FileEntry) => {
    setEntryToDelete(entry);
    setDeleteDialogOpen(true);
  }, []);
  const handleConfirmDelete = useCallback(async () => {
    if (entryToDelete) {
      await deleteEntry(entryToDelete.path);
      setEntryToDelete(null);
    }
  }, [entryToDelete, deleteEntry]);
  const handleRequestRename = useCallback((entry: FileEntry) => {
    setEntryToRename(entry);
    setRenameDialogOpen(true);
  }, []);
  const handleConfirmRename = useCallback(
    async (newName: string) => {
      if (entryToRename) {
        await renameEntry(entryToRename.path, newName);
        setEntryToRename(null);
      }
    },
    [entryToRename, renameEntry]
  );
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
  useEffect(() => {
    if (compileStatus === "compiling") {
      setShowOutputPanel(true);
      setOutputPanelTab("output");
    }
  }, [compileStatus]);
  const handleOpenSerialMonitor = useCallback(() => {
    setShowOutputPanel(true);
    setOutputPanelTab("serial");
  }, []);

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden bg-background">
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

              <div className="flex">
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleUpload}
                  disabled={compileStatus === "compiling" || daemonStatus !== "connected"}
                  title={daemonStatus !== "connected" ? "Daemon not connected" : "Compile and upload to board"}
                  className="rounded-r-none"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {compileStatus === "compiling" ? "Building..." : "Compile & Upload"}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="default"
                      size="sm"
                      disabled={compileStatus === "compiling" || daemonStatus !== "connected"}
                      className="rounded-l-none border-l border-primary-foreground/20 px-2"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleCompile}>
                      <Check className="h-4 w-4 mr-2" />
                      Verify
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleUpload}>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <Button
                variant={isSerialMonitorRunning ? "secondary" : "outline"}
                size="sm"
                onClick={handleOpenSerialMonitor}
                disabled={daemonStatus !== "connected"}
                title="Open Serial Monitor"
              >
                <Terminal className="h-4 w-4 mr-2" />
                Serial
                {isSerialMonitorRunning && (
                  <span className={`ml-2 h-2 w-2 rounded-full ${
                    serialStatus === "connected" ? "bg-green-500" :
                    serialStatus === "connecting" || serialStatus === "disconnected" ? "bg-yellow-500 animate-pulse" :
                    "bg-gray-400"
                  }`} />
                )}
              </Button>

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

      <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
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

        <ResizablePanel defaultSize={showAIChat ? "60%" : "80%"} minSize="30%">
          <ResizablePanelGroup orientation="vertical">
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

            {showOutputPanel && (
              <>
                <ResizableHandle orientation="vertical" />
                <ResizablePanel defaultSize="30%" minSize="10%" maxSize="60%">
                  <OutputPanel
                    className="h-full"
                    defaultTab={outputPanelTab}
                    onClose={() => setShowOutputPanel(false)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </ResizablePanel>

        {showAIChat && (
          <>
            <ResizableHandle />
            <ResizablePanel defaultSize="25%" minSize="15%" maxSize="50%">
              <AIChatPanel />
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>

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
