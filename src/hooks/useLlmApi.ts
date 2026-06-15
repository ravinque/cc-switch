import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { llmApiApi } from "@/lib/api/llmApi";
import type { LlmApiProfile } from "@/types";

export function useLlmApiProfiles() {
  return useQuery({
    queryKey: ["llmApi", "all"],
    queryFn: () => llmApiApi.getAll(),
  });
}

export function useUpsertLlmApiProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: LlmApiProfile) => llmApiApi.upsert(profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmApi", "all"] });
    },
  });
}

export function useDeleteLlmApiProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => llmApiApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmApi", "all"] });
    },
  });
}

export function useImportLlmApiProfiles() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => llmApiApi.importFromProviders(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["llmApi", "all"] });
    },
  });
}
