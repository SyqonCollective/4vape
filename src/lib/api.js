const API_BASE = import.meta.env.VITE_API_BASE || "/api";
const TOKEN_KEY = "4vape_token";
let authTokenResolver = null;
let logoutResolver = null;

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
  const headers = new Headers(options.headers || {});
  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  const token = await getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed: ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}
