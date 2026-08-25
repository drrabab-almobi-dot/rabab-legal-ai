---
name: customFetch credentials include
description: The shared API client fetch wrapper must send credentials for session cookie auth
---

## Rule
In `lib/api-client-react/src/custom-fetch.ts`, the fetch call must include `credentials: "include"`:
```js
const credentials: RequestCredentials = init.credentials ?? "include";
const response = await fetch(input, { ...init, method, headers, credentials });
```

**Why:** Without this, the browser does not send session cookies for requests that go through the Replit proxy, causing 401 errors on all API client hooks (useGetMe, useGetMySubscription, useCreateConsultation, etc.). Direct `fetch()` calls in pages already set `credentials: 'include'` manually, but the generated API client did not.

**How to apply:** If the api-client-react package is regenerated from the OpenAPI spec, re-apply this change to custom-fetch.ts.
