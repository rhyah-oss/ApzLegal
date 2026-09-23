/** Preserve existing array consumers while the API serves bounded database pages. */
export function installPagedFetch(baseUrl = import.meta.env.BASE_URL) {
  const original = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    const first = await original(input, init);
    const base = baseUrl.replace(/\/$/, "");
    if (method !== "GET" || url.origin !== window.location.origin || !url.pathname.startsWith(`${base}/api/`) ||
        url.searchParams.has("page") || url.searchParams.has("limit") || !first.ok || !first.headers.has("X-Next-Page")) return first;
    const rows: unknown[] = await first.json();
    let next = first.headers.get("X-Next-Page");
    while (next) {
      url.searchParams.set("page", next);
      const pageInput = input instanceof Request ? new Request(url, input) : url;
      const response = await original(pageInput, init);
      if (!response.ok) return response; // Never present a partial list as complete.
      rows.push(...await response.json());
      const following = response.headers.get("X-Next-Page");
      if (following && Number(following) <= Number(next)) throw new Error("Invalid pagination response");
      next = following;
    }
    const headers = new Headers(first.headers);
    headers.delete("content-length"); headers.delete("content-encoding"); headers.delete("X-Next-Page");
    return new Response(JSON.stringify(rows), { status: first.status, headers });
  };
}
