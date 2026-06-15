import { backendInvoke } from "@/lib/backendInvoke";
import type {
  Settings,
  WebDavSyncSettings,
  S3SyncSettings,
  RemoteSnapshotInfo,
} from "@/types";
import type { AppId } from "./types";

export interface ConfigTransferResult {
  success: boolean;
  message: string;
  filePath?: string;
  backupId?: string;
}

export interface WebDavTestResult {
  success: boolean;
  message?: string;
}

export interface CodexUnifyHistoryRestoreResult {
  restoredJsonlFiles: number;
  restoredStateRows: number;
  /** 还原被跳过的原因（如当前目录没有账本）；存在时不应报成功 */
  skippedReason?: string;
}

export interface WebDavSyncResult {
  status: string;
}

export const settingsApi = {
  async get(): Promise<Settings> {
    return await backendInvoke("get_settings");
  },

  async save(settings: Settings): Promise<boolean> {
    return await backendInvoke("save_settings", { settings });
  },

  /** 是否存在统一 Codex 会话历史的迁移备份（关闭弹窗据此显示"恢复备份"勾选） */
  async hasCodexUnifyHistoryBackup(): Promise<boolean> {
    return await backendInvoke("has_codex_unify_history_backup");
  },

  /** 按迁移备份账本把当时迁入共享桶的官方会话还原回 openai 桶（幂等） */
  async restoreCodexUnifiedHistory(): Promise<CodexUnifyHistoryRestoreResult> {
    return await backendInvoke("restore_codex_unified_history");
  },

  async restart(): Promise<boolean> {
    return await backendInvoke("restart_app");
  },

  async installUpdateAndRestart(): Promise<boolean> {
    return await backendInvoke("install_update_and_restart");
  },

  async checkUpdates(): Promise<void> {
    await backendInvoke("check_for_updates");
  },

  async isPortable(): Promise<boolean> {
    return await backendInvoke("is_portable_mode");
  },

  async getConfigDir(appId: AppId): Promise<string> {
    return await backendInvoke("get_config_dir", { app: appId });
  },

  async openConfigFolder(appId: AppId): Promise<void> {
    await backendInvoke("open_config_folder", { app: appId });
  },

  async pickDirectory(defaultPath?: string): Promise<string | null> {
    return await backendInvoke("pick_directory", { defaultPath });
  },

  async selectConfigDirectory(defaultPath?: string): Promise<string | null> {
    return await backendInvoke("pick_directory", { defaultPath });
  },

  async getClaudeCodeConfigPath(): Promise<string> {
    return await backendInvoke("get_claude_code_config_path");
  },

  async getAppConfigPath(): Promise<string> {
    return await backendInvoke("get_app_config_path");
  },

  async openAppConfigFolder(): Promise<void> {
    await backendInvoke("open_app_config_folder");
  },

  async getAppConfigDirOverride(): Promise<string | null> {
    return await backendInvoke("get_app_config_dir_override");
  },

  async setAppConfigDirOverride(path: string | null): Promise<boolean> {
    return await backendInvoke("set_app_config_dir_override", { path });
  },

  async applyClaudePluginConfig(options: {
    official: boolean;
  }): Promise<boolean> {
    const { official } = options;
    return await backendInvoke("apply_claude_plugin_config", { official });
  },

  async applyClaudeOnboardingSkip(): Promise<boolean> {
    return await backendInvoke("apply_claude_onboarding_skip");
  },

  async clearClaudeOnboardingSkip(): Promise<boolean> {
    return await backendInvoke("clear_claude_onboarding_skip");
  },

  async saveFileDialog(defaultName: string): Promise<string | null> {
    return await backendInvoke("save_file_dialog", { defaultName });
  },

  async openFileDialog(): Promise<string | null> {
    return await backendInvoke("open_file_dialog");
  },

  async exportConfigToFile(filePath: string): Promise<ConfigTransferResult> {
    return await backendInvoke("export_config_to_file", { filePath });
  },

  async importConfigFromFile(filePath: string): Promise<ConfigTransferResult> {
    return await backendInvoke("import_config_from_file", { filePath });
  },

  // ─── WebDAV sync ──────────────────────────────────────────

  async webdavTestConnection(
    settings: WebDavSyncSettings,
    preserveEmptyPassword = true,
  ): Promise<WebDavTestResult> {
    return await backendInvoke("webdav_test_connection", {
      settings,
      preserveEmptyPassword,
    });
  },

  async webdavSyncUpload(): Promise<WebDavSyncResult> {
    return await backendInvoke("webdav_sync_upload");
  },

  async webdavSyncDownload(): Promise<WebDavSyncResult> {
    return await backendInvoke("webdav_sync_download");
  },

  async webdavSyncSaveSettings(
    settings: WebDavSyncSettings,
    passwordTouched = false,
  ): Promise<{ success: boolean }> {
    return await backendInvoke("webdav_sync_save_settings", {
      settings,
      passwordTouched,
    });
  },

  async webdavSyncFetchRemoteInfo(): Promise<
    RemoteSnapshotInfo | { empty: true }
  > {
    return await backendInvoke("webdav_sync_fetch_remote_info");
  },

  // ===== S3 Sync API =====

  async s3TestConnection(
    settings: S3SyncSettings,
    preserveEmptyPassword = true,
  ): Promise<WebDavTestResult> {
    return await backendInvoke("s3_test_connection", {
      settings,
      preserveEmptyPassword,
    });
  },

  async s3SyncUpload(): Promise<WebDavSyncResult> {
    return await backendInvoke("s3_sync_upload");
  },

  async s3SyncDownload(): Promise<WebDavSyncResult> {
    return await backendInvoke("s3_sync_download");
  },

  async s3SyncSaveSettings(
    settings: S3SyncSettings,
    passwordTouched: boolean,
  ): Promise<{ success: boolean }> {
    return await backendInvoke("s3_sync_save_settings", {
      settings,
      passwordTouched,
    });
  },

  async s3SyncFetchRemoteInfo(): Promise<RemoteSnapshotInfo | { empty: true }> {
    return await backendInvoke("s3_sync_fetch_remote_info");
  },

  async syncCurrentProvidersLive(): Promise<void> {
    const result = (await backendInvoke("sync_current_providers_live")) as {
      success?: boolean;
      message?: string;
    };
    if (!result?.success) {
      throw new Error(result?.message || "Sync current providers failed");
    }
  },

  async openExternal(url: string): Promise<void> {
    try {
      const u = new URL(url);
      const scheme = u.protocol.replace(":", "").toLowerCase();
      if (scheme !== "http" && scheme !== "https") {
        throw new Error("Unsupported URL scheme");
      }
    } catch {
      throw new Error("Invalid URL");
    }
    await backendInvoke("open_external", { url });
  },

  async setAutoLaunch(enabled: boolean): Promise<boolean> {
    return await backendInvoke("set_auto_launch", { enabled });
  },

  async getAutoLaunchStatus(): Promise<boolean> {
    return await backendInvoke("get_auto_launch_status");
  },

  async getToolVersions(
    tools?: string[],
    wslShellByTool?: Record<
      string,
      { wslShell?: string | null; wslShellFlag?: string | null }
    >,
  ): Promise<
    Array<{
      name: string;
      version: string | null;
      latest_version: string | null;
      error: string | null;
      installed_but_broken: boolean;
      env_type: "windows" | "wsl" | "macos" | "linux" | "unknown";
      wsl_distro: string | null;
    }>
  > {
    return await backendInvoke("get_tool_versions", { tools, wslShellByTool });
  },

  async runToolLifecycleAction(
    tools: string[],
    action: "install" | "update",
    wslShellByTool?: Record<
      string,
      { wslShell?: string | null; wslShellFlag?: string | null }
    >,
  ): Promise<void> {
    await backendInvoke("run_tool_lifecycle_action", {
      tools,
      action,
      wslShellByTool,
    });
  },

  /** 探测各工具安装分布：枚举所有安装、标记冲突、生成锚定升级命令。
   *  诊断按钮、升级前确认、升级后补诊共用此命令，各取所需字段。 */
  async probeToolInstallations(
    tools: string[],
  ): Promise<ToolInstallationReport[]> {
    return await backendInvoke("probe_tool_installations", { tools });
  },

  async getRectifierConfig(): Promise<RectifierConfig> {
    return await backendInvoke("get_rectifier_config");
  },

  async setRectifierConfig(config: RectifierConfig): Promise<boolean> {
    return await backendInvoke("set_rectifier_config", { config });
  },

  async getOptimizerConfig(): Promise<OptimizerConfig> {
    return await backendInvoke("get_optimizer_config");
  },

  async setOptimizerConfig(config: OptimizerConfig): Promise<boolean> {
    return await backendInvoke("set_optimizer_config", { config });
  },

  async getLogConfig(): Promise<LogConfig> {
    return await backendInvoke("get_log_config");
  },

  async setLogConfig(config: LogConfig): Promise<boolean> {
    return await backendInvoke("set_log_config", { config });
  },
};

/** 单处工具安装的诊断信息（多处安装冲突检测）。字段对应后端 ToolInstallation。 */
export interface ToolInstallation {
  path: string;
  version: string | null;
  runnable: boolean;
  error: string | null;
  source: string;
  is_path_default: boolean;
}

/** 一次"探测工具安装分布"的结果。字段对应后端 ToolInstallationReport。 */
export interface ToolInstallationReport {
  tool: string;
  installs: ToolInstallation[];
  is_conflict: boolean;
  needs_confirmation: boolean;
  command: string;
  anchored: boolean;
}

export interface RectifierConfig {
  enabled: boolean;
  requestThinkingSignature: boolean;
  requestThinkingBudget: boolean;
  requestMediaFallback: boolean;
  requestMediaHeuristic: boolean;
}

export interface OptimizerConfig {
  enabled: boolean;
  thinkingOptimizer: boolean;
  cacheInjection: boolean;
  cacheTtl: string;
}

export interface LogConfig {
  enabled: boolean;
  level: "error" | "warn" | "info" | "debug" | "trace";
}

export interface BackupEntry {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

export const backupsApi = {
  async createDbBackup(): Promise<string> {
    return await backendInvoke("create_db_backup");
  },

  async listDbBackups(): Promise<BackupEntry[]> {
    return await backendInvoke("list_db_backups");
  },

  async restoreDbBackup(filename: string): Promise<string> {
    return await backendInvoke("restore_db_backup", { filename });
  },

  async renameDbBackup(oldFilename: string, newName: string): Promise<string> {
    return await backendInvoke("rename_db_backup", { oldFilename, newName });
  },

  async deleteDbBackup(filename: string): Promise<void> {
    await backendInvoke("delete_db_backup", { filename });
  },
};
