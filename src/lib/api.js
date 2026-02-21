const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "4vape_token";
const CLERK_ENABLED = Boolean(
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
);
let authTokenResolver = null;
let logoutResolver = null;
let authReady = !CLERK_ENABLED;
let authReadyWaiters = [];

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
  if (CLERK_ENABLED && String(path || "").startsWith("/admin")) {
    await waitForAuthReady();
  }

  async function runRequest(forceTokenRefresh = false) {
    const headers = new Headers(options.headers || {});
    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const token = forceTokenRefresh && authTokenResolver ? await authTokenResolver() : await getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    return fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });
  }

  let res = await runRequest(false);

  // Clerk token can be a few ms late right after login; retry once with refreshed token.
  if ((res.status === 401 || res.status === 403) && authTokenResolver) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    res = await runRequest(true);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}
