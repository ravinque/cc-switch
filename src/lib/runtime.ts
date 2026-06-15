/** True when running inside the Tauri desktop shell. */
export function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return "__TAURI_INTERNALS__" in window;
}

/** True when served by the embedded Web UI HTTP server. */
export function isWebRuntime(): boolean {
  return !isTauriRuntime() && typeof window !== "undefined";
}

const TOKEN_STORAGE_KEY = "cc-switch-web-token";

export function captureWebTokenFromUrl(): void {
  if (!isWebRuntime()) return;
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token");
  if (token) {
    sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
    params.delete("token");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}${window.location.hash}`;
    window.history.replaceState({}, "", next);
  }
}

export function getWebAuthToken(): string {
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
}

export function setWebAuthToken(token: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
}
