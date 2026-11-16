// Vite replaces this public setting at build time. No secrets belong in VITE_*.
export function makeApiUrl(path, base = "") {
  return `${base.trim().replace(/\/+$/, "")}/api/${path.replace(/^\/+/, "")}`;
}
export function apiUrl(path) {
  return makeApiUrl(path, import.meta.env?.VITE_API_BASE_URL || "");
}
