import { AdminSection } from "@/components/admin/admin-section";
import { StatusPill } from "@/components/ui/primitives";

export default function AdminBackupsPage() {
  return (
    <AdminSection
      title="Backup Settings"
      headers={["Target", "Schedule", "Last run", "Status"]}
      rows={[
        ["PostgreSQL", "Daily 02:00", "2026-06-12 02:00", <StatusPill key="1" status="verified" />],
        ["MinIO documents", "Daily 03:00", "2026-06-12 03:00", <StatusPill key="2" status="verified" />],
        ["Qdrant vectors", "Weekly Sun", "2026-06-08 04:00", <StatusPill key="3" status="verified" />],
      ]}
    />
  );
}
