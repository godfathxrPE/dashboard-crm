import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface PendingAction {
  type: 'call' | 'meeting' | 'task';
  date: string;
}

interface DrawerStore {
  isOpen: boolean;
  toggle: () => void;
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
  pendingAction: PendingAction | null;
  setPendingAction: (action: PendingAction | null) => void;
}

export const useDrawerStore = create<DrawerStore>()(
  persist(
    (set) => ({
      // Закрыт по умолчанию: открытый drawer сжимал доску и дублировал
      // виджеты (СЕЙЧАС В РАБОТЕ, звонки). Открывается кнопкой в хедере.
      isOpen: false,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      selectedDate: null,
      setSelectedDate: (date) => set({ selectedDate: date }),
      pendingAction: null,
      setPendingAction: (action) => set({ pendingAction: action }),
    }),
    {
      name: 'drawer-state',
      partialize: (state) => ({ isOpen: state.isOpen }),
    },
  ),
);
