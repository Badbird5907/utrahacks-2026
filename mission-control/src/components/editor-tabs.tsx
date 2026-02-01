"use client";

import { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { OpenFile } from "@/lib/project-state";

interface EditorTabsProps {
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onSelectTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  hasUnsavedChanges: (path: string) => boolean;
}

function getFileIcon(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();

  const iconColors: Record<string, string> = {
    ino: "bg-teal-400",
    cpp: "bg-blue-400",
    c: "bg-blue-300",
    h: "bg-purple-400",
    hpp: "bg-purple-400",
    ts: "bg-blue-400",
    tsx: "bg-blue-400",
    js: "bg-yellow-400",
    json: "bg-yellow-300",
  };

  return iconColors[ext || ""] || "bg-muted-foreground";
}

/**
 * Get display label for a file tab.
 * Shows just the filename, or includes parent directory path if there are duplicates.
 */
function getTabDisplayLabel(file: OpenFile, openFiles: OpenFile[]): string {
  const duplicates = openFiles.filter(f => f.name === file.name);
  
  if (duplicates.length <= 1) {
    return file.name;
  }
  
  // Find the minimum path segments needed to disambiguate
  const pathSegments = duplicates.map(f => {
    const normalized = f.path.replace(/\\/g, '/');
    return normalized.split('/').slice(0, -1); // Get parent directories
  });
  
  // Find how many segments from the end we need to show to make each unique
  const fileIndex = duplicates.findIndex(f => f.path === file.path);
  const currentSegments = pathSegments[fileIndex];
  
  // Start from 1 segment and increase until we find uniqueness
  for (let depth = 1; depth <= currentSegments.length; depth++) {
    const currentSuffix = currentSegments.slice(-depth).join('/');
    const isUnique = pathSegments.every((segments, idx) => {
      if (idx === fileIndex) return true;
      const otherSuffix = segments.slice(-depth).join('/');
      return otherSuffix !== currentSuffix;
    });
    
    if (isUnique) {
      return `${currentSuffix}/${file.name}`;
    }
  }
  
  // Fallback: show full path
  return file.path.replace(/\\/g, '/');
}

export function EditorTabs({
  openFiles,
  activeFilePath,
  onSelectTab,
  onCloseTab,
  hasUnsavedChanges,
}: EditorTabsProps) {
  // Compute display labels for all tabs
  const displayLabels = useMemo(() => {
    const labels = new Map<string, string>();
    for (const file of openFiles) {
      labels.set(file.path, getTabDisplayLabel(file, openFiles));
    }
    return labels;
  }, [openFiles]);

  if (openFiles.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center border-b border-border bg-muted/30 overflow-x-auto">
      {openFiles.map((file) => {
        const isActive = file.path === activeFilePath;
        const isUnsaved = hasUnsavedChanges(file.path);
        const displayLabel = displayLabels.get(file.path) || file.name;

        return (
          <div
            key={file.path}
            className={cn(
              "group flex items-center gap-2 border-r border-border px-3 py-2 text-sm cursor-pointer transition-colors min-w-0",
              isActive
                ? "bg-background text-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
            onClick={() => onSelectTab(file.path)}
            title={file.path}
          >
            {/* File type indicator dot */}
            <span
              className={cn(
                "h-2 w-2 rounded-full shrink-0",
                getFileIcon(file.name)
              )}
            />

            {/* File name */}
            <span className="truncate max-w-[200px]">{displayLabel}</span>

            {/* Unsaved indicator or close button */}
            <div className="flex items-center shrink-0 w-4 h-4">
              {isUnsaved ? (
                <span
                  className={cn(
                    "h-2 w-2 rounded-full bg-primary",
                    "group-hover:hidden"
                  )}
                  title="Unsaved changes"
                />
              ) : null}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-4 w-4 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
                  isUnsaved && "group-hover:flex"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(file.path);
                }}
                title="Close"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface EditorTabsEmptyProps {
  onOpenProject: () => void;
}

export function EditorTabsEmpty({ onOpenProject }: EditorTabsEmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
      <p className="text-lg mb-4">No file open</p>
      <p className="text-sm mb-4">
        Open a project folder to start editing Arduino sketches
      </p>
      <Button variant="outline" onClick={onOpenProject}>
        Open Project
      </Button>
    </div>
  );
}
