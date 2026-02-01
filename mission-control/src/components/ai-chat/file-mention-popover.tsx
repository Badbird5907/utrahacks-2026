"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FileText, Folder } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { FileEntry } from "@/lib/daemon-client";

// Text file extensions that can be mentioned
const TEXT_EXTENSIONS = [
  '.ino', '.cpp', '.c', '.h', '.hpp', '.cc', '.cxx',
  '.txt', '.json', '.md', '.yaml', '.yml', '.xml',
  '.js', '.ts', '.jsx', '.tsx', '.css', '.scss',
  '.html', '.htm', '.py', '.rb', '.go', '.rs',
  '.sh', '.bash', '.zsh', '.fish',
  '.env', '.gitignore', '.editorconfig',
  '.toml', '.ini', '.cfg', '.conf',
];

export interface MentionedFile {
  path: string;
  name: string;
}

interface FileMentionPopoverProps {
  query: string;
  fileTree: FileEntry[] | null;
  onSelect: (file: MentionedFile) => void;
  onClose: () => void;
  position?: { top: number; left: number };
}

function flattenFileTree(entries: FileEntry[]): FileEntry[] {
  const result: FileEntry[] = [];

  function traverse(items: FileEntry[]) {
    for (const item of items) {
      if (item.type === 'file') {
        // Check if it's a text file
        const ext = item.name.substring(item.name.lastIndexOf('.')).toLowerCase();
        if (TEXT_EXTENSIONS.includes(ext) || !item.name.includes('.')) {
          result.push(item);
        }
      } else if (item.type === 'directory' && item.children) {
        traverse(item.children);
      }
    }
  }

  traverse(entries);
  return result;
}

function filterFiles(files: FileEntry[], query: string): FileEntry[] {
  if (!query) return files.slice(0, 20); // Show first 20 when no query

  const lowerQuery = query.toLowerCase();

  return files
    .filter((file) => {
      const fileName = file.name.toLowerCase();
      const filePath = file.path.toLowerCase();
      return fileName.includes(lowerQuery) || filePath.includes(lowerQuery);
    })
    .slice(0, 20); // Limit results
}

export function FileMentionPopover({
  query,
  fileTree,
  onSelect,
  onClose,
}: FileMentionPopoverProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const allFiles = fileTree ? flattenFileTree(fileTree) : [];
  const filteredFiles = filterFiles(allFiles, query);

  // Reset selection when query changes
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredFiles.length - 1 ? prev + 1 : prev
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case 'Enter':
          e.preventDefault();
          if (filteredFiles[selectedIndex]) {
            onSelect({
              path: filteredFiles[selectedIndex].path,
              name: filteredFiles[selectedIndex].name,
            });
          }
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    },
    [filteredFiles, selectedIndex, onSelect, onClose]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Scroll selected item into view
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const selectedEl = container.querySelector(`[data-index="${selectedIndex}"]`);
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (filteredFiles.length === 0) {
    return (
      <div className="absolute bottom-full left-0 mb-1 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md z-50">
        <p className="text-sm text-muted-foreground px-2 py-1">
          No files found
        </p>
      </div>
    );
  }

  return (
    <div className="absolute bottom-full left-0 mb-1 w-72 rounded-md border bg-popover text-popover-foreground shadow-md z-50 overflow-hidden">
      <ScrollArea className="max-h-48" ref={containerRef}>
        <div className="p-1">
          {filteredFiles.map((file, index) => (
            <button
              key={file.path}
              data-index={index}
              className={cn(
                "flex items-center gap-2 w-full rounded-sm px-2 py-1.5 text-left text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                index === selectedIndex && "bg-accent text-accent-foreground"
              )}
              onClick={() =>
                onSelect({
                  path: file.path,
                  name: file.name,
                })
              }
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {file.type === 'directory' ? (
                <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <div className="flex flex-col min-w-0 flex-1">
                <span className="truncate font-medium">{file.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {file.path}
                </span>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
