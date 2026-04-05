import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ModalId =
  | 'task' | 'project' | 'call' | 'meeting'
  | 'contact' | 'company' | 'export' | 'review'
  | 'command-palette' | null;

interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  activeModal: ModalId;
  editingId: string | null;
  openModal: (modal: ModalId, editId?: string) => void;
  closeModal: () => void;

  commandPaletteOpen: boolean;
  toggleCommandPalette: () => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      activeModal: null,
      editingId: null,
      openModal: (modal, editId) =>
        set({ activeModal: modal, editingId: editId ?? null }),
      closeModal: () => set({ activeModal: null, editingId: null }),

      commandPaletteOpen: false,
      toggleCommandPalette: () =>
        set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
    }),
    {
      name: 'dashboard-ui',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    },
  ),
);
