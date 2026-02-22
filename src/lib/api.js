const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "4vape_token";
const CLERK_ENABLED = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);
const DEV_API_LOG =
  typeof window !== "undefined" &&
  (localStorage.getItem("4vape_debug_api") === "1" || import.meta.env.DEV);
let authTokenResolver = null;
let logoutResolver = null;
let authReady = !CLERK_ENABLED;
let authReadyWaiters = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let apiReqSeq = 0;

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function setAuthTokenResolver(resolver) {
  authTokenResolver = typeof resolver === "function" ? resolver : null;
}

export function setAuthReady(ready) {
  authReady = Boolean(ready);
  if (!authReady) return;
  const waiters = authReadyWaiters;
  authReadyWaiters = [];
  for (const resolve of waiters) resolve();
}

async function waitForAuthReady(timeoutMs = 1800) {
  if (authReady) return;
  await Promise.race([
    new Promise((resolve) => authReadyWaiters.push(resolve)),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export function setLogoutResolver(resolver) {
  logoutResolver = typeof resolver === "function" ? resolver : null;
}

export async function getAuthToken() {
  if (authTokenResolver) {
    const resolved = await authTokenResolver();
    if (resolved) return resolved;
    try {
      const clerkToken = await window?.Clerk?.session?.getToken?.();
      if (clerkToken) return clerkToken;
    } catch {
      // ignore and continue
    }
    // When Clerk resolver is active, avoid falling back to stale local JWT.
    return null;
  }
  return getToken();
}

export async function logout() {
  clearToken();
  if (logoutResolver) {
    await logoutResolver();
  }
}

export async function api(path, options = {}) {
  const reqId = ++apiReqSeq;
  const isAdminPath = String(path || "").startsWith("/admin");
  const method = String(options.method || "GET").toUpperCase();
  const startedAt = Date.now();
  if (CLERK_ENABLED && isAdminPath) {
    await waitForAuthReady();
  }

  async function resolveToken(forceTokenRefresh = false) {
    if (!isAdminPath) {
      return forceTokenRefresh && authTokenResolver ? await authTokenResolver() : await getAuthToken();
    }
    // On Clerk login transition, token can be briefly unavailable: wait before firing request.
    for (let i = 0; i < 16; i += 1) {
      const token =
        forceTokenRefresh && authTokenResolver ? await authTokenResolver() : await getAuthToken();
      if (token) return token;
      await sleep(150);
    }
    return forceTokenRefresh && authTokenResolver ? await authTokenResolver() : await getAuthToken();
  }

  async function runRequest(forceTokenRefresh = false) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const token = await resolveToken(forceTokenRefresh);
    if (token) headers.set("Authorization", `Bearer ${token}`);
    if (DEV_API_LOG) {
      console.log(`[api#${reqId}] -> ${method} ${path}`, {
        forceTokenRefresh,
        hasAuthHeader: Boolean(token),
        authReady,
      });
    }

    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  }

  let res;
  try {
    res = await runRequest(false);
  } catch (err) {
    console.error(`[api#${reqId}] NETWORK FAIL ${method} ${path}`, {
      elapsedMs: Date.now() - startedAt,
      error: String(err?.message || err),
    });
    throw err;
  }

  // Clerk token can be a few ms late right after login; retry once with refreshed token.
  if ((res.status === 401 || res.status === 403) && authTokenResolver) {
    if (DEV_API_LOG) {
      console.warn(`[api#${reqId}] ${res.status} retrying ${method} ${path}`);
    }
    await sleep(300);
    try {
      res = await runRequest(true);
    } catch (err) {
      console.error(`[api#${reqId}] NETWORK FAIL retry1 ${method} ${path}`, {
        elapsedMs: Date.now() - startedAt,
        error: String(err?.message || err),
      });
      throw err;
    }
    if (res.status === 401 || res.status === 403) {
      await sleep(450);
      try {
        res = await runRequest(true);
      } catch (err) {
        console.error(`[api#${reqId}] NETWORK FAIL retry2 ${method} ${path}`, {
          elapsedMs: Date.now() - startedAt,
          error: String(err?.message || err),
        });
        throw err;
      }
    }
  }

  if (!res.ok) {
    const text = await res.text();
    console.error(`[api#${reqId}] FAIL ${method} ${path}`, {
      status: res.status,
      elapsedMs: Date.now() - startedAt,
      body: text?.slice?.(0, 400) || text,
    });
    throw new Error(text || `Request failed: ${res.status}`);
  }

  if (DEV_API_LOG) {
    console.log(`[api#${reqId}] <- ${res.status} ${method} ${path}`, {
      elapsedMs: Date.now() - startedAt,
    });
  }

  if (res.status === 204) return null;
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    const body = await res.text();
    console.error(`[api#${reqId}] NON-JSON ${method} ${path}`, {
      status: res.status,
      contentType,
      body: body?.slice?.(0, 400) || body,
    });
    throw new Error(`Unexpected response type (${contentType || "unknown"})`);
  }
  try {
    return await res.json();
  } catch (err) {
    const body = await res.text().catch(() => "");
    console.error(`[api#${reqId}] JSON PARSE FAIL ${method} ${path}`, {
      status: res.status,
      contentType,
      body: body?.slice?.(0, 400) || body,
      error: String(err?.message || err),
    });
    throw err;
  }
}
