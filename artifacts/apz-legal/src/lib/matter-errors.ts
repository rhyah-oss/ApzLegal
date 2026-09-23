export function matterCreationError(error: unknown): string {
  const data = (error as { data?: { code?: string; complianceStatus?: string } } | null)?.data;
  if (data?.code === "FICA_COMPLIANCE_REQUIRED") {
    const reason = data.complianceStatus === "review_required" ? "FICA review is required" : "FICA compliance is incomplete";
    return `${reason}. Open the client's Compliance tab and resolve the outstanding requirements before creating a matter.`;
  }
  return "Failed to create matter. Please try again.";
}
