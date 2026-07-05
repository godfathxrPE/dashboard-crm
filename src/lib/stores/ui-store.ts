import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ModalId =
  | 'task' | 'project' | 'call' | 'meeting'
  | 'contact' | 'company' | 'export' | 'review'
  | 'command-palette' | null;

/** Контекст-préfill для модалок, открываемых из палитры/очереди (Sprint W2b) */
export interface ModalContext {
  contactId?: string;
  companyId?: string;
  projectId?: string;
}

interface UiState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;

  activeModal: ModalId;
  editingId: string | null;
  modalContext: ModalContext | null;
  openModal: (modal: ModalId, editId?: string, context?: ModalContext) => void;
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
      modalContext: null,
      openModal: (modal, editId, context) =>
        set({ activeModal: modal, editingId: editId ?? null, modalContext: context ?? null }),
      closeModal: () => set({ activeModal: null, editingId: null, modalContext: null }),

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
