import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  activeCaseId: string | null;
  setActiveCaseId: (id: string | null) => void;
  showPII: boolean;
  togglePII: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  activeCaseId: null,
  setActiveCaseId: (id) => set({ activeCaseId: id }),
  showPII: false,
  togglePII: () => set((state) => ({ showPII: !state.showPII })),
}));
