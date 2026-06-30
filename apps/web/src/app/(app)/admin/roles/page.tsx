import { AdminSection } from "@/components/admin/admin-section";

export default function AdminRolesPage() {
  return (
    <AdminSection
      title="Roles & Permissions"
      headers={["Role", "Matters", "Documents", "AI", "Admin"]}
      rows={[
        ["Partner", "All", "All", "Yes", "Partial"],
        ["Attorney", "Assigned", "Assigned", "Yes", "No"],
        ["Paralegal", "Assigned", "Read/Write", "Yes", "No"],
        ["Billing Admin", "Billing", "No", "No", "Billing"],
        ["Compliance Officer", "Read", "Read", "No", "Audit"],
      ]}
    />
  );
}
