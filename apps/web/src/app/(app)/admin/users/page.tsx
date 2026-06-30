import { AdminSection } from "@/components/admin/admin-section";

const users = [
  { name: "Adv. N. Mbeki", email: "n.mbeki@smithpartners.co.za", role: "Partner" },
  { name: "Adv. L. van der Merwe", email: "l.vdm@smithpartners.co.za", role: "Partner" },
  { name: "Adv. S. Dlamini", email: "s.dlamini@smithpartners.co.za", role: "Attorney" },
  { name: "Billing Admin", email: "billing@smithpartners.co.za", role: "Billing Admin" },
];

export default function AdminUsersPage() {
  return (
    <AdminSection
      title="Users"
      headers={["Name", "Email", "Role"]}
      rows={users.map((u) => [u.name, u.email, u.role])}
    />
  );
}
