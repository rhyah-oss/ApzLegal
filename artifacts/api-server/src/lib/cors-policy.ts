export function allowedOrigins(env: NodeJS.ProcessEnv = process.env): Set<string> {
  const origins = new Set<string>();
  for (const value of [env.APP_URL, ...(env.CORS_ALLOWED_ORIGINS ?? "").split(",")]) {
    if (!value?.trim()) continue;
    const url = new URL(value.trim());
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.origin !== value.trim()) {
      throw new Error("CORS origins must be explicit HTTP(S) origins without paths or credentials");
    }
    origins.add(url.origin);
  }
  return origins;
}

export function isAllowedOrigin(origin: string | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  if (!origin) return true;
  if (allowedOrigins(env).has(origin)) return true;
  if (env.NODE_ENV !== "production") {
    try {
      const url = new URL(origin);
      return ["http:", "https:"].includes(url.protocol) && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    } catch { return false; }
  }
  return false;
}
