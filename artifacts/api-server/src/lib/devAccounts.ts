export interface DevAccount {
  role: string;
  name: string;
  email: string;
  label: string;
}

export const DEV_ACCOUNTS: DevAccount[] = [
  { role: "managing_partner", name: "Sarah van der Merwe", email: "sarah@apzlegal.co.za", label: "Managing Partner" },
  { role: "partner", name: "James Nkosi", email: "james@apzlegal.co.za", label: "Partner" },
  { role: "associate_attorney", name: "Priya Pillay", email: "priya@apzlegal.co.za", label: "Associate Attorney" },
  { role: "candidate_attorney", name: "Alex Botha", email: "candidate@apzlegal.co.za", label: "Candidate Attorney" },
  { role: "paralegal", name: "Lindiwe Khumalo", email: "lindiwe@apzlegal.co.za", label: "Paralegal" },
  { role: "compliance_officer", name: "Fatima Moosa", email: "fatima@apzlegal.co.za", label: "Compliance Officer" },
  { role: "secretary", name: "Legal Secretary", email: "secretary@apzlegal.co.za", label: "Legal Secretary" },
  { role: "super_admin", name: "Super Admin", email: "superadmin@apzlegal.co.za", label: "Super Admin" },
];

export const DEV_ACCOUNT_BY_ROLE: ReadonlyMap<string, DevAccount> = new Map(
  DEV_ACCOUNTS.map((account) => [account.role, account]),
);

export const DEV_ACCOUNT_BY_EMAIL: ReadonlyMap<string, DevAccount> = new Map(
  DEV_ACCOUNTS.map((account) => [account.email.toLowerCase(), account]),
);

export interface DevIdentityRequest {
  role?: unknown;
  email?: unknown;
  name?: unknown;
}

export type DevResolution =
  | { ok: true; account: DevAccount }
  | { ok: false; code: "DEV_ROLE_UNKNOWN" | "DEV_EMAIL_MISMATCH" | "DEV_NAME_MISMATCH"; message: string };

export function resolveDevAccount(request: DevIdentityRequest): DevResolution {
  const role = typeof request.role === "string" ? request.role.trim() : "";
  if (!role || !DEV_ACCOUNT_BY_ROLE.has(role)) {
    return { ok: false, code: "DEV_ROLE_UNKNOWN", message: `Unknown dev role: ${role || "<none>"}` };
  }
  const account = DEV_ACCOUNT_BY_ROLE.get(role) as DevAccount;

  const email = typeof request.email === "string" ? request.email.trim().toLowerCase() : "";
  if (email && email !== account.email.toLowerCase()) {
    return {
      ok: false,
      code: "DEV_EMAIL_MISMATCH",
      message: `Dev identity email mismatch for role "${account.role}": expected ${account.email}.`,
    };
  }

  const name = typeof request.name === "string" ? request.name.trim() : "";
  if (name && name !== account.name) {
    return {
      ok: false,
      code: "DEV_NAME_MISMATCH",
      message: `Dev identity name mismatch for role "${account.role}": expected ${account.name}.`,
    };
  }

  return { ok: true, account };
}

export type ExistingUserLike = { id: number; name: string; email: string; role: string } | null;

export type DevLoginDecision =
  | { action: "create" }
  | { action: "use"; user: { id: number; name: string; email: string; role: string } }
  | { action: "reject"; code: "DEV_ROLE_MISMATCH"; message: string };

export function decideDevLogin(account: DevAccount, existing: ExistingUserLike): DevLoginDecision {
  if (!existing) {
    return { action: "create" };
  }

  if (existing.role !== account.role) {
    return {
      action: "reject",
      code: "DEV_ROLE_MISMATCH",
      message: `Refusing to authenticate the shared "${existing.role}" identity for the "${account.role}" dev identity (${account.email}).`,
    };
  }

  return {
    action: "use",
    user: { id: existing.id, name: existing.name, email: existing.email, role: existing.role },
  };
}
