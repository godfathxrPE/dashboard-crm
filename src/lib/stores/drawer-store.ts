import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface DrawerStore {
  isOpen: boolean;
  toggle: () => void;
  selectedDate: string | null;
  setSelectedDate: (date: string | null) => void;
}

export const useDrawerStore = create<DrawerStore>()(
  persist(
    (set) => ({
      isOpen: true,
      toggle: () => set((s) => ({ isOpen: !s.isOpen })),
      selectedDate: null,
      setSelectedDate: (date) => set({ selectedDate: date }),
    }),
    {
      name: 'drawer-state',
      partialize: (state) => ({ isOpen: state.isOpen }),
    },
  ),
);
