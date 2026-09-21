---
name: APZ Legal login cache fix
description: After login, setQueryData directly rather than invalidating so AuthGate sees the user immediately.
---

## Rule
After a successful login mutation, write the user directly into the React Query cache with `queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user)` before calling `setLocation("/")`.

## Why
`invalidateQueries` marks the query stale and triggers a background re-fetch, but `isLoading` is only `true` during the *initial* load (no data yet). After a 401 error the query status is `"error"` — a subsequent invalidation sets `isFetching: true` but `isLoading` stays `false`. AuthGate checks `if (!user) return <LoginPage />`, so it keeps rendering the login screen throughout the background re-fetch. Using `setQueryData` populates the cache synchronously — AuthGate sees the user on the very next render cycle.

## How to apply
In `login.tsx` onSuccess callback:
```ts
onSuccess: (data) => {
  queryClient.setQueryData(getGetCurrentUserQueryKey(), data.user)
  setLocation("/")
}
```
The login endpoint returns `{ user, token }`. `data.user` matches the shape returned by `GET /api/auth/me`.
