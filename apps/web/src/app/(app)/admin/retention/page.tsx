import { AdminSection } from "@/components/admin/admin-section";

export default function AdminRetentionPage() {
  return (
    <AdminSection
      title="Document Retention"
      headers={["Document class", "Retention", "Action"]}
      rows={[
        ["Correspondence", "7 years", "Archive"],
        ["Pleadings", "Permanent", "Retain"],
        ["Billing records", "5 years", "Archive"],
        ["AI session logs", "3 years", "Archive"],
      ]}
    />
  );
}
