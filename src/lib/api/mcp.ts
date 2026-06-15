import { backendInvoke } from "@/lib/backendInvoke";
import type {
  McpConfigResponse,
  McpServer,
  McpServerSpec,
  McpServersMap,
  McpStatus,
} from "@/types";
import type { AppId } from "./types";

export const mcpApi = {
  async getStatus(): Promise<McpStatus> {
    return await backendInvoke("get_claude_mcp_status");
  },

  async readConfig(): Promise<string | null> {
    return await backendInvoke("read_claude_mcp_config");
  },

  async upsertServer(
    id: string,
    spec: McpServerSpec | Record<string, any>,
  ): Promise<boolean> {
    return await backendInvoke("upsert_claude_mcp_server", { id, spec });
  },

  async deleteServer(id: string): Promise<boolean> {
    return await backendInvoke("delete_claude_mcp_server", { id });
  },

  async validateCommand(cmd: string): Promise<boolean> {
    return await backendInvoke("validate_mcp_command", { cmd });
  },

  /**
   * @deprecated 使用 getAllServers() 代替（v3.7.0+）
   */
  async getConfig(app: AppId = "claude"): Promise<McpConfigResponse> {
    return await backendInvoke("get_mcp_config", { app });
  },

  /**
   * @deprecated 使用 upsertUnifiedServer() 代替（v3.7.0+）
   */
  async upsertServerInConfig(
    app: AppId,
    id: string,
    spec: McpServer,
    options?: { syncOtherSide?: boolean },
  ): Promise<boolean> {
    const payload = {
      app,
      id,
      spec,
      ...(options?.syncOtherSide !== undefined
        ? { syncOtherSide: options.syncOtherSide }
        : {}),
    };
    return await backendInvoke("upsert_mcp_server_in_config", payload);
  },

  /**
   * @deprecated 使用 deleteUnifiedServer() 代替（v3.7.0+）
   */
  async deleteServerInConfig(
    app: AppId,
    id: string,
    options?: { syncOtherSide?: boolean },
  ): Promise<boolean> {
    const payload = {
      app,
      id,
      ...(options?.syncOtherSide !== undefined
        ? { syncOtherSide: options.syncOtherSide }
        : {}),
    };
    return await backendInvoke("delete_mcp_server_in_config", payload);
  },

  /**
   * @deprecated 使用 toggleApp() 代替（v3.7.0+）
   */
  async setEnabled(app: AppId, id: string, enabled: boolean): Promise<boolean> {
    return await backendInvoke("set_mcp_enabled", { app, id, enabled });
  },

  // ========================================================================
  // v3.7.0 新增：统一 MCP 管理 API
  // ========================================================================

  /**
   * 获取所有 MCP 服务器（统一结构）
   */
  async getAllServers(): Promise<McpServersMap> {
    return await backendInvoke("get_mcp_servers");
  },

  /**
   * 添加或更新 MCP 服务器（统一结构）
   */
  async upsertUnifiedServer(server: McpServer): Promise<void> {
    return await backendInvoke("upsert_mcp_server", { server });
  },

  /**
   * 删除 MCP 服务器
   */
  async deleteUnifiedServer(id: string): Promise<boolean> {
    return await backendInvoke("delete_mcp_server", { id });
  },

  /**
   * 切换 MCP 服务器在指定应用的启用状态
   */
  async toggleApp(
    serverId: string,
    app: AppId,
    enabled: boolean,
  ): Promise<void> {
    return await backendInvoke("toggle_mcp_app", { serverId, app, enabled });
  },

  /**
   * 从所有应用导入 MCP 服务器
   */
  async importFromApps(): Promise<number> {
    return await backendInvoke("import_mcp_from_apps");
  },

  async fetchInternalCatalog(
    registryUrl: string,
  ): Promise<InternalMcpCatalogEntry[]> {
    return await backendInvoke("fetch_internal_mcp_catalog", { registryUrl });
  },

  async importInternalServers(
    registryUrl: string,
    serverIds: string[],
  ): Promise<InternalMcpImportResult> {
    return await backendInvoke("import_internal_mcp_servers", {
      registryUrl,
      serverIds,
    });
  },
};

export interface InternalMcpImportResult {
  imported: number;
  skipped: Array<{
    id: string;
    title: string;
    reason: string;
  }>;
}

export interface InternalMcpCatalogEntry {
  id: string;
  title: string;
  summary?: string;
  importMethod: string;
  importContent?: string;
  gitUrl?: string;
  readme?: string;
}
