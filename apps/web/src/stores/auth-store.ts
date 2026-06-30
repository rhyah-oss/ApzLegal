import { create } from "zustand";
import { persist } from "zustand/middleware";

type UserRole = "partner" | "client" | "admin" | "viewer";

type Session = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

const DEMO_SESSION: Session = {
  id: "demo",
  name: "Demo User",
  email: "demo@lexora.ai",
  role: "viewer",
};

type AuthState = {
  session: Session | null;
  isDemoViewer: boolean;
  signOut: () => void;
  signIn: (session: Session) => void;
  setDemoViewer: (isDemo: boolean) => void;
  resetToDemo: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: DEMO_SESSION,
      isDemoViewer: true,
      signOut: () => {
        set({ session: DEMO_SESSION, isDemoViewer: true });
      },
      signIn: (session) => {
        set({ session, isDemoViewer: false });
      },
      setDemoViewer: (isDemo) => {
        if (isDemo) {
          set({
            session: DEMO_SESSION,
            isDemoViewer: true,
          });
        } else {
          set({ session: null, isDemoViewer: false });
        }
      },
      resetToDemo: () => {
        set({ session: DEMO_SESSION, isDemoViewer: true });
      },
    }),
    {
      name: "lexora-auth",
      version: 1,
    }
  )
);