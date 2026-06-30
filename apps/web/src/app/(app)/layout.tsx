"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { useAuthStore } from "@/stores/auth-store";

// Mock mode safe rendering — no auth enforcement
// App always renders AppShell regardless of auth state
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { setDemoViewer } = useAuthStore();

  useEffect(() => {
    // Initialize demo session on mount
    setDemoViewer(true);
  }, [setDemoViewer]);

  return <AppShell>{children}</AppShell>;
}