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
  /** Палитра открыта в режиме «только Действия» (глобальный хоткей N) */
  paletteActionsOnly: boolean;
  toggleCommandPalette: () => void;
  openCommandPalette: (actionsOnly?: boolean) => void;
  closeCommandPalette: () => void;
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
      paletteActionsOnly: false,
      toggleCommandPalette: () =>
        set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen, paletteActionsOnly: false })),
      openCommandPalette: (actionsOnly = false) =>
        set({ commandPaletteOpen: true, paletteActionsOnly: actionsOnly }),
      closeCommandPalette: () =>
        set({ commandPaletteOpen: false, paletteActionsOnly: false }),
    }),
    {
      name: 'dashboard-ui',
      partialize: (state) => ({ sidebarOpen: state.sidebarOpen }),
    },
  ),
);
