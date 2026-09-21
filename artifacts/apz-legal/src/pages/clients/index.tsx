import { useState } from "react"
import { useLocation } from "wouter"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Search, Plus, MoreHorizontal, AlertTriangle, Users } from "lucide-react"

import { useListClients, useCreateClient, getListClientsQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageLoader } from "@/components/ui/loader"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/hooks/use-toast"
import { T, cardStyle, pillStyle } from "@/lib/theme"

const ClientInputType = {
  individual: "individual",
  corporate: "corporate",
  trust: "trust",
  government: "government",
} as const
type ClientInputType = typeof ClientInputType[keyof typeof ClientInputType]

const clientSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  type: z.nativeEnum(ClientInputType),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional(),
  idNumber: z.string().optional(),
  companyRegistration: z.string().optional(),
})

type ClientFormValues = z.infer<typeof clientSchema>

// ── FICA pill ─────────────────────────────────────────────────────────────────
const FICA_COLOR: Record<string, string> = {
  compliant: T.ok,
  pending:   T.warn,
  expired:   "#F97316",
  blocked:   T.risk,
}

function FicaBadge({ status }: { status: string }) {
  const color = FICA_COLOR[status] ?? T.textDim
  return (
    <span style={pillStyle(color)}>
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, flexShrink: 0 }} />
      {status}
    </span>
  )
}

// ── Type pill ─────────────────────────────────────────────────────────────────
const TYPE_COLOR: Record<string, string> = {
  individual: T.blue,
  corporate:  T.cyan,
  trust:      "#A78BFA",
  government: T.textDim,
}

function TypeBadge({ type }: { type: string }) {
  const color = TYPE_COLOR[type] ?? T.textDim
  return <span style={pillStyle(color)}>{type}</span>
}

// ── Risk bar ──────────────────────────────────────────────────────────────────
function RiskBar({ score }: { score: number }) {
  const color = score > 70 ? T.risk : score > 30 ? T.warn : T.ok
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 64, height: 4, background: T.borderSub, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${score}%`, height: "100%", background: color, borderRadius: 4 }} />
      </div>
      <span style={{ fontSize: 11, color: T.textDim, fontVariantNumeric: "tabular-nums" }}>{score}</span>
    </div>
  )
}

export default function ClientsPage() {
  const [, setLocation] = useLocation()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState("")
  const [sheetOpen, setSheetOpen] = useState(false)

  const { data: clients, isLoading, isError, refetch } = useListClients({ search })
  const createClient = useCreateClient()

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: "",
      type: ClientInputType.individual,
      email: "",
      phone: "",
      idNumber: "",
    },
  })

  function onSubmit(data: ClientFormValues) {
    createClient.mutate(
      { data },
      {
        onSuccess: (newClient) => {
          queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() })
          setSheetOpen(false)
          form.reset()
          toast({ title: "Client created", description: "New client has been successfully added." })
          setLocation(`/clients/${newClient.id}`)
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create client. Please try again.", variant: "destructive" })
        },
      }
    )
  }

  return (
    <div className="clients-page" style={{ flex: 1, minHeight: 0, background: T.bg, padding: "24px", display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <h2 style={{ fontSize: 11, fontWeight: 700, color: T.textFaint, textTransform: "uppercase", letterSpacing: "0.1em", margin: 0 }}>
            Clients
          </h2>
          <p style={{ fontSize: 12, color: T.textDim, marginTop: 4 }}>
            Manage client profiles, FICA status, and related matters.
          </p>
        </div>

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <button
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "7px 14px",
                background: `linear-gradient(135deg, ${T.blue}, ${T.cyan})`,
                border: "none",
                borderRadius: 8,
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                cursor: "pointer",
                letterSpacing: "0.02em",
              }}
            >
              <Plus size={14} /> New Client
            </button>
          </SheetTrigger>
          <SheetContent className="sm:max-w-md overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Create New Client</SheetTitle>
              <SheetDescription>
                Enter the client details below. FICA documents can be uploaded after creation.
              </SheetDescription>
            </SheetHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-6">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Client Type</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select client type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value={ClientInputType.individual}>Individual</SelectItem>
                          <SelectItem value={ClientInputType.corporate}>Corporate</SelectItem>
                          <SelectItem value={ClientInputType.trust}>Trust</SelectItem>
                          <SelectItem value={ClientInputType.government}>Government</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name / Company Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe or Acme Corp" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="contact@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormControl>
                        <Input placeholder="+27 00 000 0000" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="idNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>ID / Registration Number</FormLabel>
                      <FormControl>
                        <Input placeholder="SA ID or CIPC registration number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* FICA notice */}
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    padding: "10px 12px",
                    background: `color-mix(in srgb, ${T.warn} 14%, transparent)`,
                    border: `1px solid color-mix(in srgb, ${T.warn} 30%, transparent)`,
                    borderRadius: 8,
                    marginTop: 8,
                  }}
                >
                  <AlertTriangle size={14} style={{ color: T.warn, flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 11, color: "#D4A843", lineHeight: 1.5, margin: 0 }}>
                    Matters cannot be opened for this client until FICA compliance is verified. Upload documents after creation.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full mt-6"
                  disabled={createClient.isPending}
                >
                  {createClient.isPending ? "Creating…" : "Create Client"}
                </Button>
              </form>
            </Form>
          </SheetContent>
        </Sheet>
      </div>

      {/* ── Search ── */}
      <div style={{ position: "relative", maxWidth: 400 }}>
        <Search
          size={13}
          style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: T.textFaint, pointerEvents: "none" }}
        />
        <input
          type="search"
          placeholder="Search by name, email or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            height: 34,
            paddingLeft: 30,
            paddingRight: 12,
            background: T.surfaceEl,
            border: `1px solid ${T.border}`,
            borderRadius: 7,
            color: T.text,
            fontSize: 12,
            outline: "none",
          }}
        />
      </div>

      {/* ── Table card ── */}
      <div style={{ ...cardStyle, overflow: "hidden" }}>
        <Table>
          <TableHeader>
            <TableRow style={{ background: T.surfaceEl, borderBottom: `1px solid ${T.border}` }}>
              {["Client", "Type", "FICA", "Risk Score", "Matters", "Actions"].map((h, i) => (
                <TableHead
                  key={h}
                  style={{
                    color: T.textFaint,
                    fontSize: 10,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.09em",
                    textAlign: i === 5 ? "right" : undefined,
                  }}
                >
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} style={{ height: 96, textAlign: "center" }}>
                  <PageLoader />
                </TableCell>
              </TableRow>
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} style={{ height: 120, textAlign: "center" }}>
                  <div className="list-state">
                    <AlertTriangle size={16} />
                    <strong>Clients could not be loaded</strong>
                    <span>Check your connection and try again.</span>
                    <button type="button" onClick={() => refetch()}>Retry</button>
                  </div>
                </TableCell>
              </TableRow>
            ) : clients?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} style={{ height: 120, textAlign: "center" }}>
                  <div className="list-state">
                    <Users size={16} />
                    <strong>{search ? "No matching clients" : "No clients yet"}</strong>
                    <span>{search ? "Try a different search term." : "Add a client profile to start managing matters."}</span>
                    {!search && <button type="button" onClick={() => setSheetOpen(true)}>Add client</button>}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              clients?.map((client) => (
                <TableRow
                  key={client.id}
                  style={{ borderBottom: `1px solid ${T.borderSub}`, cursor: "pointer" }}
                  onClick={() => setLocation(`/clients/${client.id}`)}
                >
                  <TableCell>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{client.name}</span>
                      <span style={{ fontSize: 11, color: T.textDim }}>
                        {client.email || client.phone || "No contact info"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <TypeBadge type={client.type} />
                  </TableCell>
                  <TableCell>
                    <FicaBadge status={client.ficaStatus} />
                  </TableCell>
                  <TableCell>
                    {client.riskScore !== undefined && client.riskScore !== null ? (
                      <RiskBar score={client.riskScore} />
                    ) : (
                      <span style={{ fontSize: 11, color: T.textDim }}>Not assessed</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span style={{ fontSize: 13, color: T.textDim, fontVariantNumeric: "tabular-nums" }}>{client.matterCount || 0}</span>
                  </TableCell>
                  <TableCell style={{ textAlign: "right" }}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setLocation(`/clients/${client.id}`) }}
                        >
                          View Profile
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setLocation(`/matters?client=${client.id}`) }}
                        >
                          Open Matter
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => { e.stopPropagation(); setLocation(`/clients/${client.id}?tab=fica`) }}
                        >
                          Update FICA
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
