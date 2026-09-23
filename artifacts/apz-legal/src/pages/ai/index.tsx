import { visiblePrompt, uniqueSources } from "@/lib/ai-presentation"
import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
  Bot, History, CheckCircle2, PanelLeftClose, PanelLeftOpen, Copy,
  ThumbsUp, ThumbsDown, RotateCcw, Check, Mic, Square, X, LoaderCircle,
} from "lucide-react"
import {
  getListAiConversationsQueryKey,
  useGenerateAiOutput,
  useListAiConversations,
  useListMatters,
  useReviewAiOutput,
  type AiGenerateInputWorkflow,
  type AiOutput,
} from "@workspace/api-client-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { PageLoader } from "@/components/ui/loader"
import { useToast } from "@/hooks/use-toast"
import { T, cardStyle, pillStyle } from "@/lib/theme"
import { useVoiceTranscription } from "@/hooks/use-voice-transcription"

const getRiskColor = (level: string) => {
  if (level === "low")    return T.ok
  if (level === "medium") return T.warn
  if (level === "high")   return T.risk
  return T.textFaint
}

function BubbleAction({
  icon: Icon, label, onClick, active = false, activeColor = T.blue,
}: {
  icon: React.ElementType
  label: string
  onClick: () => void
  active?: boolean
  activeColor?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className="group/btn relative flex h-6 w-6 items-center justify-center transition-all"
      style={{
        borderRadius: 6,
        color: active ? activeColor : T.textFaint,
        background: active ? `${activeColor}18` : "transparent",
        border: `1px solid ${active ? `${activeColor}40` : "transparent"}`,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          e.currentTarget.style.background = T.surfaceEl
          e.currentTarget.style.color = T.textDim
          e.currentTarget.style.borderColor = T.border
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          e.currentTarget.style.background = "transparent"
          e.currentTarget.style.color = T.textFaint
          e.currentTarget.style.borderColor = "transparent"
        }
      }}
    >
      <Icon className="h-3 w-3" />
      <span
        className="pointer-events-none absolute -top-7 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap px-1.5 py-0.5 text-[10px] font-medium opacity-0 transition-opacity group-hover/btn:opacity-100"
        style={{ background: T.surfaceEl, color: T.textDim, border: `1px solid ${T.border}`, borderRadius: 4 }}
      >
        {label}
      </span>
    </button>
  )
}

function workflowForPrompt(prompt: string): AiGenerateInputWorkflow {
  const normalised = prompt.toLowerCase()
  if (normalised.includes("summaris")) return "summarise_matter"
  if (normalised.includes("email") || normalised.includes("correspondence")) return "draft_email"
  if (normalised.includes("clause") || normalised.includes("analyse") || normalised.includes("analyze")) return "analyse_clause"
  if (normalised.includes("contract") || normalised.includes("agreement")) return "draft_contract"
  return "legal_research"
}

function confidenceLabel(score: number | null | undefined) {
  return score !== null && score !== undefined ? `${Math.round(score)}%` : "N/A"
}

type AiOutputWithSources = AiOutput & {
  sourcesUsed?: Array<{
    id?: number
    type?: string
    title?: string
    chunkCount?: number
  }> | null
  chunksRetrieved?: number
  retrievalMode?: string | null
}

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  outputId?: number
  output?: AiOutputWithSources
  pending?: boolean
  error?: string
}

function promptFromOutput(output: AiOutputWithSources) {
  return visiblePrompt(output)
}

function messageKey(message: ChatMessage) {
  if (message.pending) return `pending:${message.id}`
  if (message.outputId != null) return `${message.role}:${message.outputId}`
  return `${message.role}:${message.text}`
}

function UserMessageBubble({
  message,
  copied,
  onCopy,
}: {
  message: ChatMessage
  copied: boolean
  onCopy: (text: string) => void
}) {
  return (
    <div className="flex justify-end group/user">
      <div className="flex max-w-[80%] flex-col items-end gap-1.5">
        <div
          className="w-full p-4"
          style={{
            ...cardStyle,
            background: message.pending ? T.surfaceB : T.surfaceEl,
            borderLeft: `3px solid ${message.pending ? T.textFaint : T.blue}`,
            opacity: message.pending ? 0.75 : 1,
          }}
        >
          <p className="text-[13px]" style={{ color: T.text }}>{message.text}</p>
          {message.pending && (
            <p className="mt-2 text-[10px] font-medium uppercase tracking-[0.08em]" style={{ color: T.textFaint }}>
              Sending
            </p>
          )}
          {message.error && (
            <p className="mt-2 text-[10px]" style={{ color: T.risk }}>
              {message.error}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover/user:opacity-100">
          <BubbleAction
            icon={copied ? Check : Copy}
            label={copied ? "Copied!" : "Copy"}
            active={copied}
            onClick={() => onCopy(message.text)}
          />
        </div>
      </div>
    </div>
  )
}

function AssistantMessageBubble({
  output,
  copied,
  onCopy,
  reaction,
  onReaction,
  onReview,
  reviewPending,
  onRegenerate,
}: {
  output: AiOutputWithSources
  copied: boolean
  onCopy: (text: string) => void
  reaction: "up" | "down" | null
  onReaction: (value: "up" | "down") => void
  onReview: (conversation: AiOutputWithSources) => void
  reviewPending: boolean
  onRegenerate: (query: string) => void
}) {
  return (
    <div className="flex items-start gap-4 group/ai">
      <div
        className="flex h-7 w-7 shrink-0 items-center justify-center mt-1"
        style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`, borderRadius: 8 }}
      >
        <Bot className="h-3.5 w-3.5 text-white" />
      </div>
      <div className="flex-1 space-y-2">
        <div
          style={{
            ...cardStyle,
            background: T.surfaceB,
            borderLeft: `3px solid ${T.cyan}`,
            padding: "20px 24px",
          }}
        >
          <div style={{ color: T.textDim }}>
            {output.response.split("\n").map((paragraph, index) => (
              <p
                key={index}
                className={`text-[13px] leading-relaxed ${paragraph.startsWith("-") ? "ml-4" : ""}`}
              >
                {paragraph}
              </p>
            ))}
          </div>

          {((output.sourcesUsed?.length ?? 0) > 0 || (output.citations?.length ?? 0) > 0) && (
            <div className="mt-5 pt-4" style={{ borderTop: `1px solid ${T.border}` }}>
              {output.sourcesUsed && output.sourcesUsed.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {uniqueSources(output.sourcesUsed).map((source: any, index) => (
                    <span
                      key={index}
                      className="text-[9px] font-medium"
                      style={{
                        color: T.textDim,
                        background: T.surfaceEl,
                        border: `1px solid ${T.border}`,
                        borderRadius: 4,
                        padding: "2px 6px",
                      }}
                    >
                      {source.type || "source"} {source.title ? `(${source.title})` : `#${source.id}`} {source.chunkCount ? `×${source.chunkCount}` : ""}
                    </span>
                  ))}
                </div>
              )}
              {output.citations && output.citations.length > 0 && (
                <ul className="mt-3 text-[10px] leading-relaxed list-disc pl-4 space-y-1" style={{ color: T.textDim }}>
                  {[...new Set(output.citations)].map((citation, index) => <li key={index}>{citation}</li>)}
                </ul>
              )}
              {output.citationStatus === "unverified" && (
                <p className="mt-2 text-[9px] font-medium uppercase tracking-[0.08em]" style={{ color: T.warn }}>
                  Citations require verification
                </p>
              )}
            </div>
          )}

          <div
            className="mt-5 pt-4 flex items-center justify-between"
            style={{ borderTop: `1px solid ${T.border}` }}
          >
            <div className="flex items-center gap-5">
              <div className="flex items-center gap-2 text-[11px]">
                <span style={{ color: T.textFaint }}>Confidence</span>
                <span className="font-mono" style={{ color: T.text }}>
                  {confidenceLabel(output.confidenceScore)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px]">
                <span style={{ color: T.textFaint }}>Risk</span>
                <span style={pillStyle(getRiskColor(output.riskLevel))}>
                  {output.riskLevel}
                </span>
              </div>
            </div>
            <button
              type="button"
              disabled={output.reviewStatus !== "pending" || reviewPending}
              className="flex items-center gap-1.5 text-[11px] px-2.5 py-1 transition-colors disabled:opacity-50"
              style={{ color: T.textFaint, border: "1px solid transparent", borderRadius: 6 }}
              onClick={() => onReview(output)}
              onMouseEnter={(e) => { e.currentTarget.style.color = T.text; e.currentTarget.style.borderColor = T.border }}
              onMouseLeave={(e) => { e.currentTarget.style.color = T.textFaint; e.currentTarget.style.borderColor = "transparent" }}
            >
              <CheckCircle2 className="h-3 w-3" />
              {output.reviewStatus === "pending" ? "Mark Reviewed" : "Reviewed"}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-1 pl-1 opacity-0 transition-opacity group-hover/ai:opacity-100">
          <BubbleAction
            icon={copied ? Check : Copy}
            label={copied ? "Copied!" : "Copy response"}
            active={copied}
            onClick={() => onCopy(output.response)}
          />
          <div className="w-px h-3 mx-0.5" style={{ background: T.border }} />
          <BubbleAction
            icon={ThumbsUp}
            label="Good response"
            active={reaction === "up"}
            activeColor={T.ok}
            onClick={() => onReaction("up")}
          />
          <BubbleAction
            icon={ThumbsDown}
            label="Poor response"
            active={reaction === "down"}
            activeColor={T.risk}
            onClick={() => onReaction("down")}
          />
          <div className="w-px h-3 mx-0.5" style={{ background: T.border }} />
          <BubbleAction
            icon={RotateCcw}
            label="Regenerate"
            onClick={() => onRegenerate(output.query)}
          />
        </div>
      </div>
    </div>
  )
}

export default function AiAssistantPage() {
  const [query, setQuery] = useState("")
  const [matterId, setMatterId] = useState<string>("all")
  const [activeThreadId, setActiveThreadId] = useState<number | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [copiedQuery, setCopiedQuery] = useState(false)
  const [copiedReply, setCopiedReply] = useState(false)
  const [reaction, setReaction] = useState<"up" | "down" | null>(null)
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const generateOutput = useGenerateAiOutput()
  const reviewOutput = useReviewAiOutput()
  const voice = useVoiceTranscription((transcript) => {
    setQuery((current) => current.trim() ? `${current.trim()}\n${transcript}` : transcript)
  })

  const { data: conversations, isLoading: loadingConversations } = useListAiConversations()
  const { data: matters } = useListMatters({})

  useEffect(() => {
    if (!conversations) return

    setMessages((current) => {
      const persisted = [...conversations]
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        .flatMap((output): ChatMessage[] => [
          {
            id: `user-${output.id}`,
            role: "user",
            text: promptFromOutput(output),
            outputId: output.id,
            output,
          },
          {
            id: `assistant-${output.id}`,
            role: "assistant",
            text: output.response,
            outputId: output.id,
            output,
          },
        ])

      const merged = [...current]
      const seen = new Set(merged.map(messageKey))

      for (const message of persisted) {
        const key = messageKey(message)
        if (seen.has(key)) continue
        merged.push(message)
        seen.add(key)
      }

      return merged
    })
  }, [conversations])

  const copyText = async (text: string, which: "query" | "reply") => {
    try {
      await navigator.clipboard.writeText(text)
      if (which === "query") {
        setCopiedQuery(true)
        window.setTimeout(() => setCopiedQuery(false), 1800)
      } else {
        setCopiedReply(true)
        window.setTimeout(() => setCopiedReply(false), 1800)
      }
    } catch {
      toast({ title: "Could not copy response", variant: "destructive" })
    }
  }

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault()
    const prompt = query.trim()
    if (!prompt || generateOutput.isPending) return

    if (matterId === "all") {
      toast({
        title: "Matter required",
        description: "Select a matter before sending. Governed AI outputs must be bound to a matter.",
        variant: "destructive",
      })
      return
    }

    const workflow = workflowForPrompt(prompt)
    const pendingMessage: ChatMessage = {
      id: `pending-${Date.now()}`,
      role: "user",
      text: prompt,
      pending: true,
    }
    setMessages((current) => [...current, pendingMessage])
    setQuery("")
    voice.reset()

    generateOutput.mutate({
      data: {
        workflow,
        matterId: Number(matterId),
        instructions: prompt,
        params: { query: prompt },
      },
    }, {
      onSuccess: (output) => {
        setActiveThreadId(output.id)
        setMessages((current) => {
          const withoutPending = current.filter((message) => !(message.pending && message.text === prompt))
          const userExists = withoutPending.some((message) =>
            message.role === "user" && message.outputId === output.id
          )
          const assistantExists = withoutPending.some((message) =>
            message.role === "assistant" && message.outputId === output.id
          )
          return [
            ...withoutPending,
            ...(userExists ? [] : [{
              id: `user-${output.id}`,
              role: "user" as const,
              text: promptFromOutput(output),
              outputId: output.id,
              output,
            }]),
            ...(assistantExists ? [] : [{
              id: `assistant-${output.id}`,
              role: "assistant" as const,
              text: output.response,
              outputId: output.id,
              output,
            }]),
          ]
        })
        queryClient.invalidateQueries({ queryKey: getListAiConversationsQueryKey() })
      },
      onError: (error: any) => {
        setMessages((current) => current.map((message) =>
          message.id === pendingMessage.id
            ? { ...message, pending: false, error: error?.data?.error || error?.message || "Could not generate an AI response." }
            : message
        ))
        toast({
          title: "AI generation failed",
          description: error?.data?.error || error?.message || "Could not generate an AI response.",
          variant: "destructive",
        })
      },
    })
  }

  const activeConversation = activeThreadId
    ? conversations?.find((conversation) => conversation.id === activeThreadId)
    : conversations?.[0]

  const handleReview = (conversation: AiOutputWithSources) => {
    if (conversation.reviewStatus !== "pending" || reviewOutput.isPending) return
    reviewOutput.mutate({ id: conversation.id, data: { decision: "reviewed" } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListAiConversationsQueryKey() })
        toast({ title: "Output marked reviewed" })
      },
      onError: (error: any) => {
        toast({
          title: "Could not record review",
          description: error?.data?.error || error?.message || "Please try again.",
          variant: "destructive",
        })
      },
    })
  }

  return (
    <div className="flex h-full min-w-0" style={{ borderTop: `1px solid ${T.border}`, background: T.bg }}>
      {/* ── Sidebar ────────────────────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="w-72 shrink-0 flex flex-col"
          style={{ borderRight: `1px solid ${T.border}`, background: T.surface }}
        >
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 shrink-0" style={{ color: T.blue }} />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.textFaint }}>
                History
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="flex h-6 w-6 items-center justify-center transition-colors"
              style={{ color: T.textFaint, borderRadius: 6 }}
              title="Close history"
              onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceEl; e.currentTarget.style.color = T.text }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textFaint }}
            >
              <PanelLeftClose className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConversations ? <PageLoader /> : (
              <div>
                {conversations?.map((conversation) => {
                  const isActive = activeThreadId
                    ? activeThreadId === conversation.id
                    : conversations[0]?.id === conversation.id
                  const riskColor = getRiskColor(conversation.riskLevel)
                  return (
                    <button
                      type="button"
                      key={conversation.id}
                      onClick={() => setActiveThreadId(conversation.id)}
                      className="w-full text-left px-4 py-3 transition-colors"
                      style={{
                        background: isActive ? T.surfaceEl : "transparent",
                        borderBottom: `1px solid ${T.borderSub}`,
                        borderRight: isActive ? `2px solid ${T.blue}` : "2px solid transparent",
                      }}
                      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = T.surfaceB }}
                      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = "transparent" }}
                    >
                      <p className="text-[11px] font-medium line-clamp-2 leading-snug" style={{ color: T.text }}>
                        {promptFromOutput(conversation)}
                      </p>
                      <div className="flex items-center justify-between mt-1.5 gap-2">
                        <span className="text-[9px]" style={{ color: T.textFaint }}>
                          {new Date(conversation.createdAt).toLocaleDateString()} · Risk:
                        </span>
                        <span style={pillStyle(riskColor)}>{conversation.riskLevel}</span>
                      </div>
                    </button>
                  )
                })}
                {(!conversations || conversations.length === 0) && (
                  <p className="text-center text-[11px] py-8" style={{ color: T.textFaint }}>No conversations yet</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main ───────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col" style={{ background: T.bg }}>
        {/* Topbar */}
        <div
          className="px-5 py-3 flex items-center justify-between gap-4"
          style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="flex h-7 w-7 items-center justify-center transition-colors"
                style={{ color: T.textFaint, border: `1px solid ${T.border}`, borderRadius: 6 }}
                title="Show history"
                onMouseEnter={(e) => { e.currentTarget.style.background = T.surfaceEl; e.currentTarget.style.color = T.text }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.textFaint }}
              >
                <PanelLeftOpen className="h-3.5 w-3.5" />
              </button>
            )}
            <div>
              <h1 className="text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: T.text }}>
                APZ Legal AI
              </h1>
              <p className="text-[10px]" style={{ color: T.textFaint }}>Powered by advanced legal models</p>
            </div>
          </div>
          <div className="w-64 shrink-0">
            <Select value={matterId} onValueChange={setMatterId}>
              <SelectTrigger
                className="h-8 text-[12px]"
                style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8 }}
              >
                <SelectValue placeholder="General Context" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">General Context (No Matter)</SelectItem>
                {matters?.map((matter) => (
                  <SelectItem key={matter.id} value={String(matter.id)}>
                    {matter.reference} — {matter.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Conversation area */}
        <div className="flex-1 overflow-y-auto p-6">
          {loadingConversations && messages.length === 0 ? (
            <div className="flex h-full items-center justify-center"><PageLoader /></div>
          ) : messages.length > 0 || generateOutput.isPending ? (
            <div className="max-w-3xl mx-auto space-y-6 pb-4">
              {messages.map((message) => {
                if (message.role === "user") {
                  return (
                    <UserMessageBubble
                      key={message.id}
                      message={message}
                      copied={copiedQuery}
                      onCopy={(text) => void copyText(text, "query")}
                    />
                  )
                }
                if (!message.output) return null
                return (
                  <AssistantMessageBubble
                    key={message.id}
                    output={message.output}
                    copied={copiedReply}
                    onCopy={(text) => void copyText(text, "reply")}
                    reaction={reaction}
                    onReaction={(value) => setReaction((current) => current === value ? null : value)}
                    onReview={handleReview}
                    reviewPending={reviewOutput.isPending}
                    onRegenerate={(nextQuery) => setQuery(nextQuery)}
                  />
                )
              })}

              {generateOutput.isPending && (
                <div className="flex items-start gap-3 animate-pulse">
                  <div
                    className="flex h-7 w-7 shrink-0 items-center justify-center"
                    style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 8 }}
                  >
                    <Bot className="h-3.5 w-3.5" style={{ color: T.blue }} />
                  </div>
                  <div
                    className="px-4 py-3 flex items-center gap-1.5 text-[12px]"
                    style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 10, color: T.textFaint }}
                  >
                    <div className="h-1.5 w-1.5 rounded-full animate-bounce" style={{ background: T.blue }} />
                    <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0.2s]" style={{ background: T.cyan }} />
                    <div className="h-1.5 w-1.5 rounded-full animate-bounce [animation-delay:0.4s]" style={{ background: T.blue }} />
                    <span className="ml-2">Analysing legal context…</span>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Empty state */
            <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto space-y-4">
              <div
                className="flex h-12 w-12 items-center justify-center"
                style={{ background: T.surfaceEl, border: `1px solid ${T.border}`, borderRadius: 12 }}
              >
                <Bot className="h-6 w-6" style={{ color: T.blue }} />
              </div>
              <div>
                <h2 className="text-[16px] font-semibold" style={{ color: T.text }}>How can I help you today?</h2>
                <p className="text-[12px] mt-1" style={{ color: T.textDim }}>
                  Analyse contracts, summarise matters, draft correspondence, or research precedents.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full mt-2">
                {[
                  { label: "Summarise commercial lease terms", query: "Summarise the standard terms for commercial leases." },
                  { label: "Draft FICA follow-up email", query: "Draft a polite follow-up email for outstanding FICA documents." },
                ].map((suggestion) => (
                  <button
                    type="button"
                    key={suggestion.label}
                    onClick={() => setQuery(suggestion.query)}
                    className="text-left py-3 px-4 text-[12px] transition-colors"
                    style={{ ...cardStyle, background: T.surfaceEl, color: T.textDim }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = T.blue; e.currentTarget.style.color = T.text }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.textDim }}
                  >
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input bar */}
        <div className="p-4" style={{ borderTop: `1px solid ${T.border}`, background: T.surface }}>
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
            <textarea
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask a legal question or request a draft…"
              className="w-full pr-24 min-h-[60px] max-h-[200px] resize-none pb-4 pt-3 px-4 text-[13px] outline-none"
              style={{
                background: T.surfaceEl,
                border: `1px solid ${T.border}`,
                borderRadius: 10,
                color: T.text,
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  handleSubmit(event)
                }
              }}
            />
            <div className="absolute right-3 bottom-3 flex items-center gap-2">
              <span className="text-[10px] hidden sm:inline-block" style={{ color: T.textFaint }}>⏎ to send</span>
              {voice.status === "listening" ? (
                <>
                  <button
                    type="button"
                    onClick={voice.stop}
                    aria-label="Stop recording"
                    title="Stop recording"
                    data-testid="voice-stop"
                    className="flex h-7 w-7 items-center justify-center transition-colors"
                    style={{ color: T.risk, background: `${T.risk}18`, border: `1px solid ${T.risk}45`, borderRadius: 8 }}
                  >
                    <Square className="h-3 w-3" fill="currentColor" />
                  </button>
                  <button
                    type="button"
                    onClick={voice.cancel}
                    aria-label="Cancel recording"
                    title="Cancel recording"
                    data-testid="voice-cancel"
                    className="flex h-7 w-7 items-center justify-center transition-colors"
                    style={{ color: T.textFaint, border: `1px solid ${T.border}`, borderRadius: 8 }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : voice.status === "processing" ? (
                <button
                  type="button"
                  onClick={voice.cancel}
                  aria-label="Cancel transcription"
                  title="Cancel transcription"
                  data-testid="voice-cancel"
                  className="flex h-7 w-7 items-center justify-center transition-colors"
                  style={{ color: T.warn, border: `1px solid ${T.warn}45`, borderRadius: 8 }}
                >
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={voice.start}
                  disabled={generateOutput.isPending}
                  aria-label="Record voice prompt"
                  title="Record voice prompt"
                  data-testid="voice-record"
                  className="flex h-7 w-7 items-center justify-center transition-colors disabled:opacity-40"
                  style={{
                    color: voice.status === "transcribed" ? T.ok : T.textFaint,
                    background: voice.status === "transcribed" ? `${T.ok}18` : "transparent",
                    border: `1px solid ${voice.status === "transcribed" ? `${T.ok}45` : T.border}`,
                    borderRadius: 8,
                  }}
                >
                  <Mic className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                type="submit"
                disabled={!query.trim() || generateOutput.isPending}
                className="px-3 py-1.5 text-[12px] font-medium text-white hover:opacity-90 transition-opacity disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`, borderRadius: 8 }}
              >
                Send
              </button>
            </div>
          </form>
          <p
            className="mx-auto mt-2 max-w-4xl text-[10px]"
            style={{ color: voice.status === "error" ? T.risk : voice.status === "listening" ? T.warn : T.textFaint }}
            aria-live="polite"
            data-testid="voice-status"
          >
            {voice.message || "Voice prompts are transcribed for review; raw audio is not stored."}
          </p>
          <p className="text-center mt-2 text-[10px]" style={{ color: T.textFaint }}>
            AI responses should be reviewed by a qualified legal professional before use.
          </p>
        </div>
      </div>
    </div>
  )
}
