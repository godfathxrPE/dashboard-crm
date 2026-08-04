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

  /**
   * S-CHAT-HUB-1f: недописанные сообщения по каналам. Живут здесь, а не в локальном
   * стейте треда: ChatView пересоздаёт `MessageThread` через `key={conversationId}`, и
   * при возврате в канал текст иначе теряется.
   *
   * В `partialize` НЕ входит намеренно — драфт переживает переключение канала, но не
   * перезагрузку страницы. Осознанный v1: черновик в localStorage живёт вечно и
   * всплывает через неделю в канале, о котором человек уже забыл.
   */
  chatDraftByConversation: Record<string, string>;
  setChatDraft: (conversationId: string, value: string) => void;

  /**
   * S-R2-CO360-1: выбранный фильтр ленты активности — ПО ТИПУ СУЩНОСТИ
   * (`company` / `contact` / `project`), а не по конкретной записи. Менеджер,
   * который смотрит на компании только звонками, хочет этого на всех компаниях,
   * а не заново на каждой карточке.
   *
   * Не в URL намеренно: это личная настройка просмотра, а не то, чем делятся
   * ссылкой. В `partialize` входит — переживает перезагрузку.
   */
  timelineFilter: Record<string, string>;
  setTimelineFilter: (entityType: string, value: string) => void;
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

      chatDraftByConversation: {},
      setChatDraft: (conversationId, value) =>
        set((s) => ({
          chatDraftByConversation: { ...s.chatDraftByConversation, [conversationId]: value },
        })),

      timelineFilter: {},
      setTimelineFilter: (entityType, value) =>
        set((s) => ({ timelineFilter: { ...s.timelineFilter, [entityType]: value } })),
    }),
    {
      name: 'dashboard-ui',
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        timelineFilter: state.timelineFilter,
      }),
    },
  ),
);
