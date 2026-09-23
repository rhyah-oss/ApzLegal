/** Observe both generated-client and raw same-origin API requests. */
export function installSessionExpiryHandler(onExpired: () => void, baseUrl = import.meta.env.BASE_URL) {
  const originalFetch = window.fetch.bind(window);
  let redirecting = false;
  window.fetch = async (input, init) => {
    const response = await originalFetch(input, init);
    const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
    const base = baseUrl.replace(/\/$/, "");
    if (response.status === 401 && url.origin === window.location.origin &&
        url.pathname.startsWith(`${base}/api/`) && !url.pathname.startsWith(`${base}/api/auth/`) &&
        window.location.pathname !== `${base}/login` && !redirecting) {
      // An integration's own expired OAuth token is not a staff-session expiry.
      const body = await response.clone().json().catch(() => null);
      if (body?.code === "MICROSOFT_AUTH_EXPIRED") return response;
      redirecting = true;
      onExpired();
      window.location.replace(`${base}/login`);
    }
    return response;
  };
}
