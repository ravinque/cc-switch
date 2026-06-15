import { backendInvoke } from "@/lib/backendInvoke";
import type { LlmApiProfile } from "@/types";

export interface ImportLlmApiProfilesResult {
  imported: number;
  skipped: number;
}

export const llmApiApi = {
  async getAll(): Promise<Record<string, LlmApiProfile>> {
    return await backendInvoke("get_llm_api_profiles");
  },

  async upsert(profile: LlmApiProfile): Promise<void> {
    return await backendInvoke("upsert_llm_api_profile", { profile });
  },

  async delete(id: string): Promise<boolean> {
    return await backendInvoke("delete_llm_api_profile", { id });
  },

  async importFromProviders(): Promise<ImportLlmApiProfilesResult> {
    return await backendInvoke("import_llm_api_profiles_from_providers");
  },
};
