"use client";

import { useRouter } from "next/navigation";
import { PillButton } from "@/components/ui/primitives";
import { firm } from "@/data/mock";

export default function LoginPage() {
  const router = useRouter();

  const handleSignIn = () => {
    router.replace("/");
  };

  const handleDemoSignIn = () => {
    router.replace("/");
  };

  return (
    <div className="relative flex h-screen items-center justify-center overflow-hidden bg-[var(--bg-app)] p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(var(--border-subtle) 1px, transparent 1px), linear-gradient(90deg, var(--border-subtle) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
        }}
      />

      <div className="relative w-full max-w-[380px] border border-[var(--border)] bg-[var(--bg-panel)] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.06)]">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--accent)]">
            <span className="text-[11px] font-bold text-[var(--text-inverse)]">L</span>
          </div>
          <div>
            <h1 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">
              Lexora AI
            </h1>
            <p className="text-[11px] text-[var(--text-muted)]">{firm.name}</p>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-panel)] p-4">
          <div className="mb-3 flex items-start gap-2">
            <span className="text-[10px]">🧪</span>
            <div>
              <p className="text-[10px] font-medium text-[var(--text-primary)]">
                Quick test login
              </p>
              <p className="text-[10px] text-[var(--text-muted)]">
                Passwordless sign-in as any seeded role
              </p>
            </div>
          </div>
          <p className="text-[10px] text-[var(--text-muted)]">
            Loading demo roles…
          </p>
        </div>

        <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Email
            </label>
            <input
              type="email"
              defaultValue="n.mbeki@smithpartners.co.za"
              className="lexora-focus h-[32px] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[12px] transition-colors focus:border-[var(--border-strong)]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.06em] text-[var(--text-muted)]">
              Password
            </label>
            <input
              type="password"
              defaultValue="••••••••"
              className="lexora-focus h-[32px] w-full rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-input)] px-3 text-[12px] transition-colors focus:border-[var(--border-strong)]"
            />
          </div>
          <button
            type="button"
            onClick={handleSignIn}
            className="block w-full pt-1"
          >
            <PillButton type="button" variant="default" size="md" className="w-full">
              Sign in to workspace
            </PillButton>
          </button>
          <button
            type="button"
            onClick={handleDemoSignIn}
            className="block w-full pt-1"
          >
            <PillButton type="button" variant="outline" size="md" className="w-full">
              Demo viewer access
            </PillButton>
          </button>
        </form>

        <p className="mt-5 text-center text-[10px] text-[var(--text-muted)]">
          Private deployment · {firm.jurisdiction} · Phase 1 preview
        </p>
      </div>
    </div>
  );
}
