/** Percentage layout map for the main horizontal panel group. */
export type PanelLayout = {
  sidebar: number;
  main: number;
  context: number;
};

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

export function normalizeSizes(partial: {
  sidebarSize?: number;
  contextSize?: number;
  sidebarCollapsed?: boolean;
  contextPanelOpen?: boolean;
}) {
  const sidebarSize = clamp(partial.sidebarSize ?? 18, 14, 22);
  const contextSize = clamp(partial.contextSize ?? 24, 20, 28);
  const sidebarCollapsed = partial.sidebarCollapsed ?? false;
  const contextPanelOpen = partial.contextPanelOpen ?? true;

  const sidebar = sidebarCollapsed ? 0 : sidebarSize;
  const context = contextPanelOpen ? contextSize : 0;
  const mainMin = 40;

  if (sidebar + context + mainMin > 100) {
    const overflow = sidebar + context + mainMin - 100;
    if (context >= overflow + 4) {
      return {
        sidebarSize,
        contextSize: contextSize - overflow,
        sidebarCollapsed,
        contextPanelOpen,
      };
    }
    const nextSidebar = clamp(sidebarSize - Math.max(0, overflow - context), 14, 22);
    return {
      sidebarSize: nextSidebar,
      contextSize: 20,
      sidebarCollapsed,
      contextPanelOpen,
    };
  }

  return { sidebarSize, contextSize, sidebarCollapsed, contextPanelOpen };
}

export function buildPanelLayout(partial: {
  sidebarSize: number;
  contextSize: number;
  sidebarCollapsed: boolean;
  contextPanelOpen: boolean;
}): PanelLayout {
  const normalized = normalizeSizes(partial);
  const sidebar = normalized.sidebarCollapsed ? 0 : normalized.sidebarSize;
  const context = normalized.contextPanelOpen ? normalized.contextSize : 0;
  const main = round(100 - sidebar - context);

  return { sidebar, main, context };
}
