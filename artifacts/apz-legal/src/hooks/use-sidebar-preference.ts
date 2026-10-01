import { useCallback, useEffect, useState } from "react"

/**
 * Desktop sidebar collapse preference.
 *
 * The preference is scoped narrowly to the desktop sidebar rail and is never
 * sent to the server. It only controls client-side layout. Invalid or missing
 * values fall back to the expanded default so the UI never ships in a broken
 * half-rendered state.
 */
export type SidebarCollapsePreference = boolean

export const DEFAULT_SIDEBAR_COLLAPSED: SidebarCollapsePreference = false
export const SIDEBAR_COLLAPSE_STORAGE_KEY = "apz-legal:sidebar-collapsed"

export function isValidSidebarCollapse(value: unknown): value is SidebarCollapsePreference {
  return value === true || value === false
}

export function readStoredSidebarCollapse(): SidebarCollapsePreference {
  if (typeof window === "undefined") return DEFAULT_SIDEBAR_COLLAPSED
  try {
    const raw = window.localStorage.getItem(SIDEBAR_COLLAPSE_STORAGE_KEY)
    if (raw === "true") return true
    if (raw === "false") return false
  } catch {
    // Storage may be unavailable (private mode, quota, etc.). Fall back silently.
  }
  return DEFAULT_SIDEBAR_COLLAPSED
}

function writeStoredSidebarCollapse(value: SidebarCollapsePreference) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSE_STORAGE_KEY, String(value))
  } catch {
    // Best-effort persistence; the UI still works without it.
  }
}

/**
 * Persist the desktop sidebar collapse preference in the browser and expose
 * it as state. The preference only applies on desktop: the mobile drawer is
 * always expanded and is unaffected by this setting.
 */
export function useSidebarPreference(isDesktop: boolean) {
  const [collapsed, setCollapsed] = useState<SidebarCollapsePreference>(
    () => (isDesktop ? readStoredSidebarCollapse() : DEFAULT_SIDEBAR_COLLAPSED),
  )

  // Re-read storage if the desktop flag changes (e.g. rotating the device).
  useEffect(() => {
    if (!isDesktop) {
      setCollapsed(DEFAULT_SIDEBAR_COLLAPSED)
      return
    }
    setCollapsed(readStoredSidebarCollapse())
  }, [isDesktop])

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev
      writeStoredSidebarCollapse(next)
      return next
    })
  }, [])

  const set = useCallback((value: SidebarCollapsePreference) => {
    writeStoredSidebarCollapse(value)
    setCollapsed(value)
  }, [])

  return { collapsed, toggle, set }
}