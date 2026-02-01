import { create } from 'zustand';
import { getDaemonClient } from './daemon-client';
import { useProjectStore } from './project-state';

export interface FileEdit {
  id: string;
  filePath: string;
  previousContent: string;
  newContent: string;
  description: string;
  timestamp: number;
}

interface AIChatState {
  // Edit history for undo
  editHistory: FileEdit[];

  // Actions
  pushEdit: (edit: Omit<FileEdit, 'id' | 'timestamp'>) => string;
  undoEdit: (editId: string) => Promise<boolean>;
  getEdit: (editId: string) => FileEdit | undefined;
  clearHistory: () => void;
}

function generateId(): string {
  return `edit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const useAIChatStore = create<AIChatState>((set, get) => ({
  editHistory: [],

  pushEdit: (edit) => {
    const id = generateId();
    const fullEdit: FileEdit = {
      ...edit,
      id,
      timestamp: Date.now(),
    };

    set((state) => ({
      editHistory: [...state.editHistory, fullEdit],
    }));

    return id;
  },

  undoEdit: async (editId) => {
    const edit = get().editHistory.find((e) => e.id === editId);
    if (!edit) {
      console.error('[AI Chat] Edit not found:', editId);
      return false;
    }

    try {
      const client = getDaemonClient();

      // Restore the previous content
      await client.writeFile(edit.filePath, edit.previousContent);

      // Reload in editor if open
      const reloadFile = useProjectStore.getState().reloadFile;
      await reloadFile(edit.filePath);

      // Remove from history
      set((state) => ({
        editHistory: state.editHistory.filter((e) => e.id !== editId),
      }));

      return true;
    } catch (error) {
      console.error('[AI Chat] Failed to undo edit:', error);
      return false;
    }
  },

  getEdit: (editId) => {
    return get().editHistory.find((e) => e.id === editId);
  },

  clearHistory: () => {
    set({ editHistory: [] });
  },
}));
