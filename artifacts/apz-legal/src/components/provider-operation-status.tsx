import { AlertCircle, CheckCircle2, Clock, PlugZap } from "lucide-react"
import { T, pillStyle } from "@/lib/theme"

export type ProviderOperationView = {
  id?: number
  kind?: "email" | "signature" | string
  status?: "queued" | "provider_confirmed" | "failed" | string
  providerName?: string | null
  providerRequestId?: string | null
  providerEventId?: string | null
  errorMessage?: string | null
  attempt?: number | null
  createdAt?: string | Date
  updatedAt?: string | Date
}

export function getProviderOperationState(operation: ProviderOperationView | null | undefined) {
  if (!operation) return { label: "Not requested", color: T.textFaint, Icon: PlugZap }
  if (operation.status === "failed") return { label: "Provider failed", color: T.risk, Icon: AlertCircle }
  if (operation.status === "provider_confirmed") return { label: "Provider confirmed", color: T.ok, Icon: CheckCircle2 }
  if (operation.providerName === "not_connected") return { label: "Queued · provider not connected", color: T.warn, Icon: Clock }
  return { label: "Queued for provider", color: T.warn, Icon: Clock }
}

export function ProviderOperationBadge({
  operation,
  compact = false,
}: {
  operation: ProviderOperationView | null | undefined
  compact?: boolean
}) {
  const state = getProviderOperationState(operation)
  const Icon = state.Icon
  return (
    <span style={pillStyle(state.color)} title={operation?.errorMessage ?? undefined}>
      <Icon size={compact ? 10 : 11} />
      {state.label}
    </span>
  )
}