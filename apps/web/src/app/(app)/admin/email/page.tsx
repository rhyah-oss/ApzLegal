import { AdminSection } from "@/components/admin/admin-section";
import { StatusPill } from "@/components/ui/primitives";

export default function AdminEmailPage() {
  return (
    <AdminSection
      title="Email Connectors"
      headers={["Provider", "Account", "Status", "Last sync"]}
      rows={[
        ["Microsoft 365", "n.mbeki@smithpartners.co.za", <StatusPill key="1" status="verified" />, "2026-06-11 08:00"],
        ["Gmail", "—", <StatusPill key="2" status="not_found" />, "Not connected"],
      ]}
    />
  );
}
