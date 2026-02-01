/**
 * Project State Management
 * 
 * Manages the current Arduino sketch project including:
 * - Sketch path and validation
 * - File tree
 * - Open files and tabs
 * - File watching for external changes
 * - Persisting project path to localStorage
 */

import { create } from 'zustand';
import { toast } from 'sonner';
import { 
  getDaemonClient, 
  FileEntry, 
  SketchInfo, 
  FileWatchSSEEvent 
} from './daemon-client';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'mission-control-project-path';

// ============================================================================
// Helpers
// ============================================================================

/**
 * Normalize a file path to use forward slashes consistently
 */
function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

// ============================================================================
// Types
// ============================================================================

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  originalContent: string;  // For tracking unsaved changes
  lastModified: number;
  externalVersion: number;  // Increments only on external changes (AI edits, etc.) to force editor remount
}

interface ProjectState {
  // Project info
  sketchPath: string | null;
  sketchInfo: SketchInfo | null;
  fileTree: FileEntry[] | null;
  isLoading: boolean;
  error: string | null;

  // Open files (tabs)
  openFiles: OpenFile[];
  activeFilePath: string | null;

  // File watcher
  watcherAbortController: AbortController | null;
  externalChanges: Map<string, number>;  // path -> lastModified
  pendingReloads: Set<string>;  // Files being reloaded by us (skip watcher updates)

  // Actions
  openProject: (path: string) => Promise<boolean>;
  closeProject: () => void;
  refreshFileTree: () => Promise<void>;
  
  // File operations
  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  updateFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  saveAllFiles: () => Promise<void>;
  
  // Create/delete
  createFile: (parentPath: string, name: string) => Promise<void>;
  createFolder: (parentPath: string, name: string) => Promise<void>;
  deleteEntry: (path: string) => Promise<void>;
  renameEntry: (oldPath: string, newName: string) => Promise<void>;

  // Helpers
  hasUnsavedChanges: (path?: string) => boolean;
  getOpenFile: (path: string) => OpenFile | undefined;
  acknowledgeExternalChange: (path: string) => void;
  reloadFile: (path: string) => Promise<void>;
  
  // Persistence
  restoreFromStorage: () => Promise<void>;
  getPersistedPath: () => string | null;
}

// ============================================================================
// Store
// ============================================================================

export const useProjectStore = create<ProjectState>((set, get) => ({
  // Initial state
  sketchPath: null,
  sketchInfo: null,
  fileTree: null,
  isLoading: false,
  error: null,
  openFiles: [],
  activeFilePath: null,
  watcherAbortController: null,
  externalChanges: new Map(),
  pendingReloads: new Set(),

  // ==========================================================================
  // Project Operations
  // ==========================================================================

  openProject: async (path: string) => {
    const client = getDaemonClient();
    set({ isLoading: true, error: null });

    try {
      // Validate sketch
      const sketchInfo = await client.validateSketch(path);
      if (!sketchInfo.valid) {
        set({ 
          isLoading: false, 
          error: sketchInfo.error || 'Invalid sketch' 
        });
        return false;
      }

      // Load file tree
      const fileTree = await client.listDirectory(path);

      // Stop any existing watcher
      const { watcherAbortController } = get();
      if (watcherAbortController) {
        watcherAbortController.abort();
      }

      // Start new file watcher
      const newAbortController = new AbortController();
      startFileWatcher(path, newAbortController.signal, set, get);

      set({
        sketchPath: path,
        sketchInfo,
        fileTree,
        isLoading: false,
        error: null,
        openFiles: [],
        activeFilePath: null,
        watcherAbortController: newAbortController,
        externalChanges: new Map(),
        pendingReloads: new Set(),
      });

      // Persist to localStorage
      if (typeof window !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, path);
      }

      // Auto-open main file
      if (sketchInfo.mainFile) {
        const mainFilePath = `${path}/${sketchInfo.mainFile}`.replace(/\\/g, '/');
        await get().openFile(mainFilePath);
      }

      return true;
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.message || 'Failed to open project' 
      });
      return false;
    }
  },

  closeProject: () => {
    const { watcherAbortController } = get();
    if (watcherAbortController) {
      watcherAbortController.abort();
    }

    // Clear from localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }

    set({
      sketchPath: null,
      sketchInfo: null,
      fileTree: null,
      openFiles: [],
      activeFilePath: null,
      watcherAbortController: null,
      externalChanges: new Map(),
      pendingReloads: new Set(),
      error: null,
    });
  },

  refreshFileTree: async () => {
    const { sketchPath } = get();
    if (!sketchPath) return;

    const client = getDaemonClient();
    try {
      const fileTree = await client.listDirectory(sketchPath);
      set({ fileTree });
    } catch (error: any) {
      console.error('Failed to refresh file tree:', error);
    }
  },

  // ==========================================================================
  // File Operations
  // ==========================================================================

  openFile: async (inputPath: string) => {
    // Normalize path to use forward slashes consistently
    const path = normalizePath(inputPath);
    const { openFiles } = get();
    
    // Check if already open (also check with normalized paths)
    const existing = openFiles.find(f => normalizePath(f.path) === path);
    if (existing) {
      set({ activeFilePath: existing.path });
      return;
    }

    const client = getDaemonClient();
    try {
      const result = await client.readFile(path);
      const name = path.split('/').pop() || path;

      const newFile: OpenFile = {
        path,
        name,
        content: result.content,
        originalContent: result.content,
        lastModified: result.lastModified,
        externalVersion: 0,
      };

      set(state => {
        // Double-check inside set to prevent race conditions
        if (state.openFiles.some(f => normalizePath(f.path) === path)) {
          return { activeFilePath: path };
        }
        return {
          openFiles: [...state.openFiles, newFile],
          activeFilePath: path,
        };
      });
    } catch (error: any) {
      console.error('Failed to open file:', error);
      toast.error('Failed to open file', { description: error.message });
    }
  },

  closeFile: (path: string) => {
    set(state => {
      const newOpenFiles = state.openFiles.filter(f => f.path !== path);
      let newActiveFilePath = state.activeFilePath;

      // If closing active file, switch to another
      if (state.activeFilePath === path) {
        const closedIndex = state.openFiles.findIndex(f => f.path === path);
        if (newOpenFiles.length > 0) {
          // Try to activate the file at the same index, or the last one
          const newIndex = Math.min(closedIndex, newOpenFiles.length - 1);
          newActiveFilePath = newOpenFiles[newIndex].path;
        } else {
          newActiveFilePath = null;
        }
      }

      return {
        openFiles: newOpenFiles,
        activeFilePath: newActiveFilePath,
      };
    });
  },

  setActiveFile: (path: string) => {
    set({ activeFilePath: path });
  },

  updateFileContent: (path: string, content: string) => {
    set(state => ({
      openFiles: state.openFiles.map(f =>
        f.path === path ? { ...f, content } : f
      ),
    }));
  },

  saveFile: async (path: string) => {
    const { openFiles } = get();
    const file = openFiles.find(f => f.path === path);
    if (!file) return;

    const client = getDaemonClient();
    try {
      const result = await client.writeFile(path, file.content);
      
      set(state => ({
        openFiles: state.openFiles.map(f =>
          f.path === path 
            ? { ...f, originalContent: f.content, lastModified: result.lastModified } 
            : f
        ),
      }));
    } catch (error: any) {
      console.error('Failed to save file:', error);
      toast.error('Failed to save file', { description: error.message });
      throw error;
    }
  },

  saveAllFiles: async () => {
    const { openFiles, saveFile } = get();
    const unsavedFiles = openFiles.filter(f => f.content !== f.originalContent);
    
    for (const file of unsavedFiles) {
      await saveFile(file.path);
    }
  },

  // ==========================================================================
  // Create/Delete Operations
  // ==========================================================================

  createFile: async (parentPath: string, name: string) => {
    const client = getDaemonClient();
    const fullPath = `${parentPath}/${name}`.replace(/\\/g, '/');

    try {
      await client.createEntry(fullPath, 'file');
      await get().refreshFileTree();
      await get().openFile(fullPath);
    } catch (error: any) {
      console.error('Failed to create file:', error);
      toast.error('Failed to create file', { description: error.message });
      throw error;
    }
  },

  createFolder: async (parentPath: string, name: string) => {
    const client = getDaemonClient();
    const fullPath = `${parentPath}/${name}`.replace(/\\/g, '/');

    try {
      await client.createEntry(fullPath, 'directory');
      await get().refreshFileTree();
    } catch (error: any) {
      console.error('Failed to create folder:', error);
      toast.error('Failed to create folder', { description: error.message });
      throw error;
    }
  },

  deleteEntry: async (path: string) => {
    const client = getDaemonClient();
    const normalizedPath = normalizePath(path);

    try {
      await client.deleteEntry(path);
      
      // Close any open files that match the path or are inside it (for directories)
      const { openFiles } = get();
      const filesToClose = openFiles.filter(f => {
        const normalizedFilePath = normalizePath(f.path);
        return normalizedFilePath === normalizedPath || normalizedFilePath.startsWith(normalizedPath + '/');
      });
      
      for (const file of filesToClose) {
        get().closeFile(file.path);
      }
      
      await get().refreshFileTree();
    } catch (error: any) {
      console.error('Failed to delete:', error);
      toast.error('Failed to delete', { description: error.message });
      throw error;
    }
  },

  renameEntry: async (oldPath: string, newName: string) => {
    const client = getDaemonClient();
    // Normalize to forward slashes first, then get parent directory
    const normalizedOldPath = normalizePath(oldPath);
    const parentPath = normalizedOldPath.split('/').slice(0, -1).join('/');
    const newPath = `${parentPath}/${newName}`;

    try {
      await client.renameEntry(oldPath, newPath);
      
      // Update open file paths - handles both direct file rename and files inside renamed directories
      set(state => {
        const updatedOpenFiles = state.openFiles.map(f => {
          const normalizedFilePath = normalizePath(f.path);
          
          // Exact match - the renamed item is this file
          if (normalizedFilePath === normalizedOldPath) {
            return { ...f, path: newPath, name: newName };
          }
          
          // File is inside a renamed directory
          if (normalizedFilePath.startsWith(normalizedOldPath + '/')) {
            const relativePath = normalizedFilePath.slice(normalizedOldPath.length);
            const updatedPath = newPath + relativePath;
            return { ...f, path: updatedPath };
          }
          
          return f;
        });
        
        // Update active file path if needed
        let updatedActiveFilePath = state.activeFilePath;
        if (state.activeFilePath) {
          const normalizedActivePath = normalizePath(state.activeFilePath);
          if (normalizedActivePath === normalizedOldPath) {
            updatedActiveFilePath = newPath;
          } else if (normalizedActivePath.startsWith(normalizedOldPath + '/')) {
            const relativePath = normalizedActivePath.slice(normalizedOldPath.length);
            updatedActiveFilePath = newPath + relativePath;
          }
        }
        
        return {
          openFiles: updatedOpenFiles,
          activeFilePath: updatedActiveFilePath,
        };
      });
      
      await get().refreshFileTree();
    } catch (error: any) {
      console.error('Failed to rename:', error);
      toast.error('Failed to rename', { description: error.message });
      throw error;
    }
  },

  // ==========================================================================
  // Helpers
  // ==========================================================================

  hasUnsavedChanges: (path?: string) => {
    const { openFiles } = get();
    if (path) {
      const file = openFiles.find(f => f.path === path);
      return file ? file.content !== file.originalContent : false;
    }
    return openFiles.some(f => f.content !== f.originalContent);
  },

  getOpenFile: (path: string) => {
    return get().openFiles.find(f => f.path === path);
  },

  acknowledgeExternalChange: (path: string) => {
    set(state => {
      const newChanges = new Map(state.externalChanges);
      newChanges.delete(path);
      return { externalChanges: newChanges };
    });
  },

  reloadFile: async (path: string) => {
    const normalizedPath = normalizePath(path);
    const { openFiles, pendingReloads } = get();
    const existingFile = openFiles.find(f => normalizePath(f.path) === normalizedPath);
    if (!existingFile) {
      console.log('[reloadFile] File not open:', normalizedPath);
      return;
    }

    // Mark as pending reload to prevent watcher from interfering
    const newPendingReloads = new Set(pendingReloads);
    newPendingReloads.add(normalizedPath);
    set({ pendingReloads: newPendingReloads });

    console.log('[reloadFile] Reloading file:', normalizedPath);
    const client = getDaemonClient();
    try {
      const result = await client.readFile(path);
      console.log('[reloadFile] Got new content, lastModified:', result.lastModified);
      
      set(state => {
        // Remove from pending reloads
        const updatedPendingReloads = new Set(state.pendingReloads);
        updatedPendingReloads.delete(normalizedPath);
        
        return {
          pendingReloads: updatedPendingReloads,
          openFiles: state.openFiles.map(f =>
            normalizePath(f.path) === normalizedPath 
              ? { 
                  ...f, 
                  content: result.content, 
                  originalContent: result.content, 
                  lastModified: result.lastModified,
                  externalVersion: f.externalVersion + 1,  // Increment to force editor remount
                } 
              : f
          ),
        };
      });
      console.log('[reloadFile] State updated');
    } catch (error: unknown) {
      // Remove from pending reloads even on error
      set(state => {
        const updatedPendingReloads = new Set(state.pendingReloads);
        updatedPendingReloads.delete(normalizedPath);
        return { pendingReloads: updatedPendingReloads };
      });
      console.error('Failed to reload file:', error);
    }
  },

  // ==========================================================================
  // Persistence
  // ==========================================================================

  getPersistedPath: () => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem(STORAGE_KEY);
  },

  restoreFromStorage: async () => {
    if (typeof window === 'undefined') return;
    
    const { sketchPath, openProject } = get();
    
    // Don't restore if already have a project open
    if (sketchPath) return;
    
    const storedPath = localStorage.getItem(STORAGE_KEY);
    if (storedPath) {
      // Try to open the stored project
      const success = await openProject(storedPath);
      if (!success) {
        // If failed to open, clear the stored path
        localStorage.removeItem(STORAGE_KEY);
      }
    }
  },
}));

// ============================================================================
// File Watcher Helper
// ============================================================================

async function startFileWatcher(
  path: string,
  signal: AbortSignal,
  set: (partial: Partial<ProjectState> | ((state: ProjectState) => Partial<ProjectState>)) => void,
  get: () => ProjectState
) {
  const client = getDaemonClient();

  try {
    for await (const event of client.watchDirectory(path, signal)) {
      if (signal.aborted) break;

      switch (event.event) {
        case 'change': {
          // Mark file as externally changed
          const changedPath = normalizePath(event.data.path);
          const { openFiles, pendingReloads } = get();
          
          // Skip if we're currently reloading this file ourselves
          if (pendingReloads.has(changedPath)) {
            console.log('[FileWatcher] Skipping change event for pending reload:', changedPath);
            break;
          }
          
          const openFile = openFiles.find(f => normalizePath(f.path) === changedPath);
          
          if (openFile) {
            // Reload file content
            try {
              const result = await client.readFile(changedPath);
              if (result.lastModified !== openFile.lastModified) {
                set(state => ({
                  externalChanges: new Map(state.externalChanges).set(changedPath, result.lastModified),
                  openFiles: state.openFiles.map(f =>
                    normalizePath(f.path) === changedPath
                      ? { ...f, originalContent: result.content, lastModified: result.lastModified }
                      : f
                  ),
                }));
              }
            } catch (error) {
              console.error('Failed to reload changed file:', error);
            }
          }
          break;
        }

        case 'add':
        case 'delete':
        case 'addDir':
        case 'deleteDir':
          // Refresh file tree
          await get().refreshFileTree();
          break;

        case 'error':
          console.error('File watcher error:', event.data.message);
          break;
      }
    }
  } catch (error: any) {
    if (error.name !== 'AbortError') {
      console.error('File watcher failed:', error);
    }
  }
}
