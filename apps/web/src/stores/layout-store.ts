import { create } from "zustand";
import { persist } from "zustand/middleware";
import { normalizeSizes } from "@/lib/panel-layout";

type LayoutState = {
  sidebarCollapsed: boolean;
  contextPanelOpen: boolean;
  sidebarSize: number;
  contextSize: number;
  darkMode: boolean;
  activeMatterId: string | null;
  toggleSidebar: () => void;
  toggleContextPanel: () => void;
  setSidebarSize: (size: number) => void;
  setContextSize: (size: number) => void;
  toggleDarkMode: () => void;
  setActiveMatter: (id: string | null) => void;
};

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      ...normalizeSizes({}),
      darkMode: false,
      activeMatterId: "m1",
      toggleSidebar: () =>
        set((s) => ({
          ...s,
          ...normalizeSizes({ ...s, sidebarCollapsed: !s.sidebarCollapsed }),
        })),
      toggleContextPanel: () =>
        set((s) => ({
          ...s,
          ...normalizeSizes({ ...s, contextPanelOpen: !s.contextPanelOpen }),
        })),
      setSidebarSize: (size) =>
        set((s) => ({ ...s, ...normalizeSizes({ ...s, sidebarSize: size }) })),
      setContextSize: (size) =>
        set((s) => ({ ...s, ...normalizeSizes({ ...s, contextSize: size }) })),
      toggleDarkMode: () =>
        set((s) => {
          const darkMode = !s.darkMode;
          if (typeof document !== "undefined") {
            document.documentElement.classList.toggle("dark", darkMode);
          }
          return { darkMode };
        }),
      setActiveMatter: (activeMatterId) => set({ activeMatterId }),
    }),
    {
      name: "lexora-layout",
      version: 3,
      migrate: (persisted) => {
        const s = persisted as Partial<LayoutState>;
        return { ...s, ...normalizeSizes(s) };
      },
    }
  )
);

type UiState = {
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  commandPaletteOpen: false,
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
}));
