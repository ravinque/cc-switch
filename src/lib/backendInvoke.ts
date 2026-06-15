import { getWebAuthToken, isTauriRuntime } from "@/lib/runtime";

export interface RpcEnvelope<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

export async function rpcInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const response = await fetch("/api/rpc", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getWebAuthToken()}`,
    },
    body: JSON.stringify({ command, args: args ?? {} }),
  });

  if (response.status === 401) {
    throw new Error(
      "Web UI authentication failed. Open CC Switch desktop app → Settings → Web Access to copy the access URL.",
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `RPC failed (${response.status})`);
  }

  const payload = (await response.json()) as RpcEnvelope<T>;
  if (!payload.ok) {
    throw new Error(payload.error || `RPC command failed: ${command}`);
  }
  return payload.result as T;
}

export async function backendInvoke<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (isTauriRuntime()) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<T>(command, args);
  }
  return rpcInvoke<T>(command, args);
}
