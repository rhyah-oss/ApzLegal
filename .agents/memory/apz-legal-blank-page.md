---
name: APZ Legal blank page fix
description: React Query retry behavior causes blank screen during auth redirect
---

## Problem
Default React Query retry (3 attempts) means a 401 from `/api/auth/me` takes ~3 seconds before `isLoading` becomes false. During that time, Layout returns `null` → blank white page. The redirect to `/login` only fires after `isLoading: false`.

## Fix
Configure `QueryClient` with a custom retry function that returns `false` for 401/403 status codes:
```ts
retry: (failureCount, error) => {
  const status = (error as { status?: number }).status;
  if (status === 401 || status === 403) return false;
  return failureCount < 1;
}
```

Also: show a loading spinner (not null) while `isLoading` is true in the Layout, so the user sees feedback instead of a blank page.

**Why:** The screenshot tool (and users on slow connections) catches the loading state. Without the fix, the app appears broken even though it's just waiting for retries.
