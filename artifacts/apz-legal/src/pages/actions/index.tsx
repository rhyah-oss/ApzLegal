import { useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { useLocation, Link } from "wouter"
import { CheckCircle2, AlertTriangle, Clock, ArrowRight, Inbox } from "lucide-react"

import { useGetPendingActions, getGetPendingActionsQueryKey } from "@workspace/api-client-react"
import type { PendingAction } from "@workspace/api-client-react"

import { PageLoader } from "@/components/ui/loader"
import { T, cardStyle, pillStyle } from "@/lib/theme"

export default function ActionsPage() {
  const { data, isLoading } = useGetPendingActions()
  const [, setLocation] = useLocation()

  if (isLoading) {
    return <PageLoader />
  }

  const actions = (data?.actions || []).filter(action => action.type !== "invoice_review")
  const hasActions = actions.length > 0

  const getActionIcon = (type: string) => {
    switch (type) {
      case "conflict_review":    return <AlertTriangle className="h-3.5 w-3.5" />
      case "document_approval":  return <CheckCircle2  className="h-3.5 w-3.5" />
      default:                   return <Clock         className="h-3.5 w-3.5" />
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" style={{ background: T.bg }}>

      {/* ── Page header ── */}
      <div
        className="shrink-0 px-6 py-4"
        style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}
      >
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] mb-0.5" style={{ color: T.textDim }}>
          My Actions
        </p>
        <p className="text-[12px]" style={{ color: T.textFaint }}>
          {hasActions
            ? `You have ${actions.length} action${actions.length === 1 ? "" : "s"} requiring your attention.`
            : "Your action queue is clear."}
        </p>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-3">
          {!hasActions ? (
            <div
              className="flex flex-col items-center justify-center py-24 text-center"
              style={{
                ...cardStyle,
                border: `1px dashed ${T.border}`,
              }}
            >
              <div
                className="flex h-11 w-11 items-center justify-center rounded-lg mb-4"
                style={{ background: T.surfaceEl, border: `1px solid ${T.border}` }}
              >
                <Inbox className="h-5 w-5" style={{ color: T.blue }} />
              </div>
              <h3 className="text-[13px] font-semibold mb-1" style={{ color: T.text }}>You're all caught up!</h3>
              <p className="text-[11px] max-w-sm" style={{ color: T.textDim }}>
                There are no pending actions in your queue. Enjoy the moment of calm or check back later.
              </p>
            </div>
          ) : (
            actions.map((action, idx) => {
              const isHigh = action.severity === "high"
              const accentColor = isHigh ? T.risk : T.blue
              const isOverdue = action.dueDate && new Date(action.dueDate) < new Date()

              return (
                <div
                  key={action.id}
                  className="group flex overflow-hidden cursor-pointer transition-colors animate-in fade-in slide-in-from-bottom-2"
                  style={{
                    ...cardStyle,
                    outline: "1px solid transparent",
                    animationDelay: `${idx * 50}ms`,
                  }}
                  onClick={() => setLocation(action.link)}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.outline = `1px solid ${accentColor}40` }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.outline = "1px solid transparent" }}
                >
                  {/* Severity stripe */}
                  <div className="w-1 shrink-0 rounded-l-[10px]" style={{ background: accentColor }} />

                  {/* Main content */}
                  <div className="flex-1 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Pill row */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span style={pillStyle(accentColor)}>
                          {action.type.replace(/_/g, ' ')}
                        </span>
                        {isHigh && (
                          <span style={pillStyle(T.risk)}>High Priority</span>
                        )}
                      </div>

                      <h3 className="text-[13px] font-medium truncate mb-1" style={{ color: T.text }}>
                        {action.title}
                      </h3>

                      {action.description && (
                        <p className="text-[11px] line-clamp-1 mb-2" style={{ color: T.textDim }}>
                          {action.description}
                        </p>
                      )}

                      <div className="flex items-center gap-3 text-[10px]" style={{ color: T.textDim }}>
                        <span className="flex items-center gap-1">
                          {getActionIcon(action.type)}
                          {action.entityType} #{action.entityId}
                        </span>
                        {action.createdAt && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Created {formatDistanceToNow(new Date(action.createdAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Due date + CTA */}
                    <div
                      className="flex items-center justify-between sm:justify-end gap-4 sm:pl-5"
                      style={{ borderLeft: `1px solid ${T.border}` }}
                    >
                      <div className="text-left sm:text-right">
                        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: T.textDim }}>Due</div>
                        <div
                          className="text-[11px] font-medium"
                          style={{ color: isOverdue ? T.risk : T.text }}
                        >
                          {action.dueDate ? new Date(action.dueDate).toLocaleDateString() : 'No due date'}
                        </div>
                      </div>

                      <button
                        className="flex h-8 w-8 items-center justify-center rounded transition-colors"
                        style={{
                          background: "linear-gradient(135deg, #4169E1, #00CFFF)",
                          color: "#fff",
                          border: "none",
                          flexShrink: 0,
                        }}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
