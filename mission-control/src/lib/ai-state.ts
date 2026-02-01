/**
 * AI Chat State Management
 * 
 * Manages the AI chat panel state including:
 * - Panel visibility
 * - Mentioned files for context
 * - Edit history for undo support
 */

import { create } from 'zustand';
import { getDaemonClient } from './daemon-client';

// ============================================================================
// Types
// ============================================================================

export interface EditHistoryItem {
  id: string;
  filePath: string;
  previousContent: string;
  newContent: string;
  timestamp: number;
  description: string;
}

export interface MentionedFile {
  path: string;
  name: string;
  content: string;
}

interface AIChatState {
  // Panel state
  isOpen: boolean;
  
  // Mentioned files for context
  mentionedFiles: MentionedFile[];
  
  // Edit history for undo
  editHistory: EditHistoryItem[];
  
  // Actions
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  
  // File mentions
  addMentionedFile: (file: MentionedFile) => void;
  removeMentionedFile: (path: string) => void;
  clearMentions: () => void;
  getMentionedFileContents: () => Record<string, string>;
  
  // Edit history
  pushEdit: (edit: Omit<EditHistoryItem, 'id' | 'timestamp'>) => void;
  undoLastEdit: () => Promise<boolean>;
  clearEditHistory: () => void;
}

// ============================================================================
// Store
// ============================================================================

export const useAIChatStore = create<AIChatState>((set, get) => ({
  // Initial state
  isOpen: false,
  mentionedFiles: [],
  editHistory: [],

  // ==========================================================================
  // Panel Actions
  // ==========================================================================

  togglePanel: () => {
    set(state => ({ isOpen: !state.isOpen }));
  },

  openPanel: () => {
    set({ isOpen: true });
  },

  closePanel: () => {
    set({ isOpen: false });
  },

  // ==========================================================================
  // File Mention Actions
  // ==========================================================================

  addMentionedFile: (file: MentionedFile) => {
    set(state => {
      // Don't add duplicates
      if (state.mentionedFiles.some(f => f.path === file.path)) {
        return state;
      }
      return {
        mentionedFiles: [...state.mentionedFiles, file],
      };
    });
  },

  removeMentionedFile: (path: string) => {
    set(state => ({
      mentionedFiles: state.mentionedFiles.filter(f => f.path !== path),
    }));
  },

  clearMentions: () => {
    set({ mentionedFiles: [] });
  },

  getMentionedFileContents: () => {
    const { mentionedFiles } = get();
    const contents: Record<string, string> = {};
    for (const file of mentionedFiles) {
      contents[file.path] = file.content;
    }
    return contents;
  },

  // ==========================================================================
  // Edit History Actions
  // ==========================================================================

  pushEdit: (edit) => {
    const newEdit: EditHistoryItem = {
      ...edit,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    set(state => ({
      editHistory: [...state.editHistory, newEdit],
    }));
  },

  undoLastEdit: async () => {
    const { editHistory } = get();
    if (editHistory.length === 0) {
      return false;
    }

    const lastEdit = editHistory[editHistory.length - 1];
    const client = getDaemonClient();

    try {
      // Write the previous content back to the file
      await client.writeFile(lastEdit.filePath, lastEdit.previousContent);
      
      // Remove from history
      set(state => ({
        editHistory: state.editHistory.slice(0, -1),
      }));
      
      return true;
    } catch (error) {
      console.error('Failed to undo edit:', error);
      return false;
    }
  },

  clearEditHistory: () => {
    set({ editHistory: [] });
  },
}));
