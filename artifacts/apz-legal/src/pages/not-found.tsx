import { useLocation } from "wouter"
import { T } from "@/lib/theme"

export default function NotFound() {
  const [, setLocation] = useLocation()

  return (
    <div
      className="flex min-h-screen w-full flex-col items-center justify-center"
      style={{ background: T.bg }}
    >
      <div
        className="w-full max-w-[400px] mx-4 p-8"
        style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: 10,
        }}
      >
        {/* Status line */}
        <div className="flex items-center gap-2 mb-5">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.12em] px-2 py-0.5"
            style={{
              background: `color-mix(in srgb, ${T.risk} 18%, transparent)`,
              border: `1px solid color-mix(in srgb, ${T.risk} 30%, transparent)`,
              borderRadius: 20,
              color: T.risk,
            }}
          >
            404
          </span>
          <span className="text-[10px] uppercase tracking-[0.12em]" style={{ color: T.textFaint }}>
            Page not found
          </span>
        </div>

        <h1 className="text-[17px] font-semibold mb-2" style={{ color: T.text }}>
          This page doesn't exist
        </h1>

        <p className="text-[12px] leading-relaxed mb-6" style={{ color: T.textDim }}>
          The route you requested could not be found. If you added a new page,
          make sure it has been registered in the router.
        </p>

        <div
          className="mb-6 px-3 py-2.5 text-[11px] font-mono"
          style={{
            background: T.surfaceEl,
            border: `1px solid ${T.border}`,
            borderRadius: 6,
            color: T.textDim,
          }}
        >
          {typeof window !== "undefined" ? window.location.pathname : "/"}
        </div>

        <button
          onClick={() => setLocation("/")}
          className="w-full py-2 text-[12px] font-semibold transition-opacity hover:opacity-90"
          style={{
            background: T.blue,
            color: "#fff",
            borderRadius: 6,
            border: `1px solid ${T.blue}`,
          }}
        >
          Back to dashboard
        </button>
      </div>

      {/* Subtle footer */}
      <p className="mt-6 text-[10px]" style={{ color: T.textFaint }}>
        APZ Legal · South African Legal Platform
      </p>
    </div>
  )
}
