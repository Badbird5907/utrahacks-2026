"use client";

import { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  File,
  Folder,
  FolderOpen,
  Trash2,
  FilePlus,
  FolderPlus,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { FileEntry } from "@/lib/daemon-client";

interface FileTreeProps {
  entry: FileEntry;
  selectedPath: string | null;
  onSelect: (entry: FileEntry) => void;
  onDelete: (entry: FileEntry) => void;
  onRename: (entry: FileEntry) => void;
  onRequestCreateFile: (parentPath: string) => void;
  onRequestCreateFolder: (parentPath: string) => void;
  level?: number;
  mainFileName?: string;  // The main .ino file name (e.g., "MySketch.ino")
}

function getFileIcon(fileName: string) {
  const ext = fileName.split(".").pop()?.toLowerCase();

  const iconColors: Record<string, string> = {
    // Arduino/C++
    ino: "text-teal-400",
    cpp: "text-blue-400",
    c: "text-blue-300",
    h: "text-purple-400",
    hpp: "text-purple-400",
    // Web
    ts: "text-blue-400",
    tsx: "text-blue-400",
    js: "text-yellow-400",
    jsx: "text-yellow-400",
    json: "text-yellow-300",
    css: "text-pink-400",
    html: "text-orange-400",
    // Other
    md: "text-muted-foreground",
    txt: "text-muted-foreground",
  };

  return iconColors[ext || ""] || "text-muted-foreground";
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileTree({
  entry,
  selectedPath,
  onSelect,
  onDelete,
  onRename,
  onRequestCreateFile,
  onRequestCreateFolder,
  level = 0,
  mainFileName,
}: FileTreeProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0);
  const isSelected = selectedPath === entry.path;
  const isDirectory = entry.type === "directory";
  const isMainFile = mainFileName && entry.name === mainFileName;

  const handleClick = () => {
    if (isDirectory) {
      setIsExpanded(!isExpanded);
    } else {
      onSelect(entry);
    }
  };

  const handleNewFile = () => {
    const parentPath = isDirectory
      ? entry.path
      : entry.path.split("/").slice(0, -1).join("/");
    onRequestCreateFile(parentPath);
  };

  const handleNewFolder = () => {
    const parentPath = isDirectory
      ? entry.path
      : entry.path.split("/").slice(0, -1).join("/");
    onRequestCreateFolder(parentPath);
  };

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger>
          <button
            type="button"
            onClick={handleClick}
            className={cn(
              "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary/80",
              isSelected && "bg-secondary text-foreground"
            )}
            style={{ paddingLeft: `${level * 12 + 8}px` }}
          >
            {isDirectory ? (
              <>
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                {isExpanded ? (
                  <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <Folder className="h-4 w-4 shrink-0 text-primary" />
                )}
              </>
            ) : (
              <>
                <span className="w-4" />
                <File
                  className={cn("h-4 w-4 shrink-0", getFileIcon(entry.name))}
                />
              </>
            )}
            <span className="truncate">{entry.name}</span>
            {!isDirectory && entry.size !== undefined && (
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                {formatFileSize(entry.size)}
              </span>
            )}
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48">
          {isDirectory && (
            <>
              <ContextMenuItem onClick={handleNewFile}>
                <FilePlus className="mr-2 h-4 w-4" />
                New File
              </ContextMenuItem>
              <ContextMenuItem onClick={handleNewFolder}>
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </ContextMenuItem>
            </>
          )}
          {!isMainFile && (
            <>
              <ContextMenuItem onClick={() => onRename(entry)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => onDelete(entry)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>

      {isDirectory && isExpanded && entry.children && (
        <div>
          {entry.children.map((child) => (
            <FileTree
              key={child.path}
              entry={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              onDelete={onDelete}
              onRename={onRename}
              onRequestCreateFile={onRequestCreateFile}
              onRequestCreateFolder={onRequestCreateFolder}
              level={level + 1}
              mainFileName={mainFileName}
            />
          ))}
          {entry.children.length === 0 && (
            <div
              className="px-2 py-1.5 text-xs text-muted-foreground italic"
              style={{ paddingLeft: `${(level + 1) * 12 + 8}px` }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface FileTreeHeaderProps {
  directoryName: string;
  onRefresh: () => void;
  onNewFile: () => void;
  onNewFolder: () => void;
}

export function FileTreeHeader({
  directoryName,
  onRefresh,
  onNewFile,
  onNewFolder,
}: FileTreeHeaderProps) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">
        {directoryName}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onRefresh}
          title="Refresh"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNewFile}
          title="New File"
        >
          <FilePlus className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={onNewFolder}
          title="New Folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
