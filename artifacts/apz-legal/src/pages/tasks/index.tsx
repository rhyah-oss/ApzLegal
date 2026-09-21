import { useState } from "react"
import { CheckSquare, Square, Plus, Clock, Trash2 } from "lucide-react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { T, cardStyle, pillStyle } from "@/lib/theme"

type Priority = "critical" | "high" | "medium" | "low"
type TaskStatus = "todo" | "in_progress" | "done"

interface Task {
  id: string; title: string; matter?: string; assignee?: string
  priority: Priority | "urgent"; status: TaskStatus | "pending" | "in_progress" | "completed" | "cancelled"; due?: string
  dueDate?: string; tags?: string[]; matterReference?: string; assignedToName?: string
}

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "#B75D63", high: "#B8783E", medium: "#6B7F96", low: "#7B8A9D",
}

const STATUS_GROUPS: Array<{ key: TaskStatus; label: string }> = [
  { key: "todo",        label: "To Do"       },
  { key: "in_progress", label: "In Progress" },
  { key: "done",        label: "Done"        },
]

const FILTERS: Array<{ key: "all" | Priority; label: string }> = [
  { key: "all",      label: "All"      },
  { key: "critical", label: "Critical" },
  { key: "high",     label: "High"     },
  { key: "medium",   label: "Medium"   },
  { key: "low",      label: "Low"      },
]

export default function TasksPage() {
  const [filter, setFilter] = useState<"all" | Priority>("all")
  const qc = useQueryClient()
  const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""
  const { data: tasks = [], isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/tasks`, { credentials: "include" })
      if (!response.ok) throw new Error("Unable to load tasks")
      return response.json()
    },
  })
  const updateTask = useMutation({
    mutationFn: async ({ id, ...changes }: { id: string; status?: string; title?: string; priority?: string }) => {
      const response = await fetch(`${BASE}/api/tasks/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(changes) })
      if (!response.ok) throw new Error("Unable to update task")
      return response.json()
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
  })
  const deleteTask = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`${BASE}/api/tasks/${id}`, { method: "DELETE", credentials: "include" })
      if (!response.ok) throw new Error("Unable to delete task")
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }),
  })

  const toggle = (task: Task) => {
    updateTask.mutate({ id: task.id, status: task.status === "completed" ? "pending" : "completed" })
  }
  const editTask = (task: Task) => {
    const title = window.prompt("Task title", task.title)
    if (!title?.trim()) return
    const priority = window.prompt("Priority: critical, high, medium, low", task.priority === "urgent" ? "critical" : task.priority) || task.priority
    updateTask.mutate({ id: task.id, title: title.trim(), priority })
  }

  const filtered = filter === "all" ? tasks : tasks.filter(t => (t.priority === "urgent" ? "critical" : t.priority) === filter)
  const groups = [
    { key: "pending", label: "To Do" },
    { key: "in_progress", label: "In Progress" },
    { key: "completed", label: "Done" },
  ]

  return (
    <div className="flex flex-col" style={{ minHeight: "100%", background: T.bg }}>

      {/* ── Page header ── */}
      <div className="flex items-center justify-between px-6 py-3"
        style={{ borderBottom: `1px solid ${T.border}` }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-[12px] font-semibold uppercase tracking-[0.09em]"
            style={{ color: T.text }}>Tasks</h1>
          <span className="text-[11px]" style={{ color: T.textFaint }}>
             {tasks.filter(t => t.status !== "completed").length} open
            &nbsp;·&nbsp;
             {tasks.filter(t => t.status === "completed").length} completed
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Filter pills */}
          {FILTERS.map(f => {
            const active = filter === f.key
            return (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className="px-3 py-1 text-[11px] font-medium transition-colors"
                style={{
                  borderRadius: 20,
                  background: active ? `color-mix(in srgb, ${T.blue} 22%, transparent)` : "transparent",
                  border: `1px solid ${active ? T.blue + "60" : "transparent"}`,
                  color: active ? T.text : T.textDim,
                }}>
                {f.label}
              </button>
            )
          })}

          {/* Add task */}
          <button
            className="ml-2 flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{
              background: `linear-gradient(135deg, ${T.cyan}, ${T.blue})`,
              borderRadius: 20,
            }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Task
          </button>
        </div>
      </div>

      {/* ── Task groups ── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        {isLoading ? <p className="py-12 text-center text-[12px]" style={{ color: T.textDim }}>Loading tasks…</p> : groups.map(group => {
          const groupTasks = filtered.filter(t => t.status === group.key)
          if (groupTasks.length === 0) return null
          return (
            <div key={group.key}
              style={{ ...cardStyle, overflow: "hidden" }}>

              {/* Group header */}
              <div className="flex items-center gap-2 px-4 py-2.5"
                style={{ borderBottom: `1px solid ${T.border}` }}>
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                  style={{ color: T.textDim }}>{group.label}</span>
                <span className="text-[10px] font-mono"
                  style={{ color: T.textFaint }}>{groupTasks.length}</span>
              </div>

              {/* Task rows */}
              {groupTasks.map((task, i) => (
                 <div key={task.id}
                  className="flex items-start gap-3 px-4 py-3 transition-colors"
                  style={{
                    opacity:      task.status === "done" ? 0.5 : 1,
                    borderBottom: i < groupTasks.length - 1 ? `1px solid ${T.borderSub}` : "none",
                    cursor: "default",
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = T.surfaceEl }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                >
                  {/* Checkbox */}
                   <button onClick={() => toggle(task)}
                    className="mt-0.5 shrink-0 transition-colors"
                    style={{ color: T.textDim }}>
                     {task.status === "completed"
                      ? <CheckSquare className="h-4 w-4" style={{ color: T.blue }} />
                      : <Square className="h-4 w-4" />}
                  </button>

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px]" style={{
                       textDecoration: task.status === "completed" ? "line-through" : "none",
                       color:          task.status === "completed" ? T.textDim : T.text,
                    }}>
                      {task.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px]"
                      style={{ color: T.textDim }}>
                       {task.matterReference && (
                         <span className="font-mono" style={{ color: T.textFaint }}>{task.matterReference}</span>
                      )}
                       <span>{task.assignedToName || "Unassigned"}</span>
                      {task.tags?.map(tag => (
                        <span key={tag}
                          style={{
                            ...pillStyle(T.textDim),
                            fontSize: 9,
                          }}>
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Right-side metadata */}
                  <div className="flex shrink-0 items-center gap-3">
                    {task.due && (
                      <div className="flex items-center gap-1 text-[10px]">
                        <Clock className="h-3 w-3" style={{ color: T.textFaint }} />
                        <span style={{
                           color:      task.dueDate && new Date(task.dueDate) < new Date() ? T.risk : T.textDim,
                           fontWeight: task.dueDate && new Date(task.dueDate) < new Date() ? 600 : 400,
                        }}>
                           {task.dueDate ? new Date(task.dueDate).toLocaleDateString("en-ZA") : "No due date"}
                        </span>
                      </div>
                    )}
                    {/* Priority pill */}
                    <span style={pillStyle(PRIORITY_COLOR[task.priority === "urgent" ? "critical" : task.priority])}>
                      {task.priority}
                    </span>
                    <button title="Delete task" onClick={() => { if (window.confirm("Delete this task?")) deleteTask.mutate(task.id) }} style={{ color: T.textFaint }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                    <button title="Edit task" onClick={() => editTask(task)} className="text-[10px]" style={{ color: T.blue }}>Edit</button>
                  </div>
                </div>
              ))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
