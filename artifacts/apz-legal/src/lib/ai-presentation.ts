export function visiblePrompt(output: { query: string; params?: Record<string, unknown> | null }): string {
  const query = output.params?.query;
  if (typeof query === "string" && query.trim()) return query;
  // Legacy history stores the full server prompt, including retrieved legal text.
  if (output.query.startsWith("CURRENT MATTER FACTS:\n")) {
    const marker = "\n\nATTORNEY INSTRUCTIONS:\n";
    const at = output.query.lastIndexOf(marker);
    return at >= 0 ? output.query.slice(at + marker.length).trim() : "Matter workflow request";
  }
  return output.query;
}

export function uniqueSources<T extends { type?: string; id?: number }>(sources: T[]): T[] {
  return sources.filter((source, index) => sources.findIndex(other => other.type === source.type && other.id === source.id) === index);
}
