import { backendInvoke } from "@/lib/backendInvoke";

export interface WebUiStatus {
  enabled: boolean;
  running: boolean;
  port: number;
  url?: string;
  token?: string;
  distAvailable: boolean;
}

export const webUiApi = {
  async getStatus(): Promise<WebUiStatus> {
    return await backendInvoke("get_web_ui_status");
  },

  async setEnabled(enabled: boolean, port?: number): Promise<WebUiStatus> {
    return await backendInvoke("set_web_ui_enabled", { enabled, port });
  },

  async regenerateToken(): Promise<string> {
    return await backendInvoke("regenerate_web_ui_token");
  },

  async openInBrowser(): Promise<void> {
    return await backendInvoke("open_web_ui_in_browser");
  },
};
