"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { FileEntry } from "@/lib/daemon-client";
import { cn } from "@/lib/utils";
import { FileCode } from "lucide-react";

interface FileMentionPickerProps {
  fileTree: FileEntry[] | null;
  searchQuery: string;
  onSelect: (file: FileEntry) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

export function FileMentionPicker({
  fileTree,
  searchQuery,
  onSelect,
  onClose,
  position,
}: FileMentionPickerProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Flatten file tree and filter by search query
  const flattenedFiles = useCallback(() => {
    if (!fileTree) return [];
    
    const flatten = (entries: FileEntry[], result: FileEntry[] = []): FileEntry[] => {
      for (const entry of entries) {
        if (entry.type === "file") {
          result.push(entry);
        }
        if (entry.children) {
          flatten(entry.children, result);
        }
      }
      return result;
    };

    const files = flatten(fileTree);
    
    if (!searchQuery) {
      return files.slice(0, 10); // Show first 10 files
    }

    const query = searchQuery.toLowerCase();
    return files
      .filter((file) => file.name.toLowerCase().includes(query))
      .slice(0, 10);
  }, [fileTree, searchQuery]);

  const filteredFiles = flattenedFiles();

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchQuery]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, filteredFiles.length - 1));
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          break;
        case "Enter":
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onSelect(filteredFiles[selectedIndex]);
          }
          break;
        case "Escape":
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFiles, selectedIndex, onSelect, onClose]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  if (filteredFiles.length === 0) {
    return (
      <div
        ref={containerRef}
        className="absolute z-50 w-64 bg-popover border border-border rounded-lg shadow-lg p-2"
        style={position}
      >
        <div className="text-sm text-muted-foreground text-center py-2">
          No files found
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute z-50 w-72 max-h-64 overflow-y-auto bg-popover border border-border rounded-lg shadow-lg"
      style={position}
    >
      <div className="p-1">
        {filteredFiles.map((file, index) => (
          <button
            key={file.path}
            className={cn(
              "w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm",
              "hover:bg-accent hover:text-accent-foreground",
              index === selectedIndex && "bg-accent text-accent-foreground"
            )}
            onClick={() => onSelect(file)}
            onMouseEnter={() => setSelectedIndex(index)}
          >
            <FileCode className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{file.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {getRelativePath(file.path)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Get a shortened relative path for display
function getRelativePath(fullPath: string): string {
  const parts = fullPath.split("/");
  if (parts.length <= 2) return fullPath;
  return ".../" + parts.slice(-2).join("/");
}

// Component to display a mentioned file chip
interface MentionedFileChipProps {
  name: string;
  path: string;
  onRemove: () => void;
}

export function MentionedFileChip({ name, path, onRemove }: MentionedFileChipProps) {
  return (
    <div
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-xs max-w-full"
      title={path}
    >
      <FileCode className="h-3 w-3 text-blue-500 flex-shrink-0" />
      <span className="text-blue-600 dark:text-blue-400 font-medium truncate">{name}</span>
      <button
        onClick={onRemove}
        className="hover:bg-blue-500/20 rounded p-0.5 flex-shrink-0"
        title="Remove file"
      >
        <svg
          className="h-2.5 w-2.5 text-blue-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
  );
}
