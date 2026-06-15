import type { SkillRepo } from "@/lib/api/skills";

export type ParsedSkillRepoInput = {
  owner: string;
  name: string;
  gitUrl?: string;
  registryUrl?: string;
};

const SKILL_REGISTRY_HOSTS = ["skills.int.rclabenv.com"];

/** Parse GitHub owner/name, custom git host, or internal skill registry URLs. */
export function parseSkillRepoUrl(input: string): ParsedSkillRepoInput | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return parseHttpRepoUrl(trimmed);
  }

  const withoutGit = trimmed.replace(/\.git$/, "");
  const parts = withoutGit.split("/").filter(Boolean);
  if (parts.length === 2 && !parts[0].includes(".")) {
    return { owner: parts[0], name: parts[1] };
  }

  return null;
}

function parseHttpRepoUrl(raw: string): ParsedSkillRepoInput | null {
  try {
    const url = new URL(raw);
    if (SKILL_REGISTRY_HOSTS.includes(url.hostname)) {
      return {
        owner: url.hostname,
        name: "registry",
        registryUrl: raw.replace(/\/+$/, ""),
      };
    }

    if (url.hostname === "github.com") {
      const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
      if (parts.length >= 2 && parts[0] && parts[1]) {
        const name = parts[1].replace(/\.git$/, "");
        return { owner: parts[0], name };
      }
      return null;
    }

    const host = url.hostname;
    const pathParts = url.pathname
      .replace(/^\/+|\/+$/g, "")
      .split("/")
      .filter(Boolean);
    const name = pathParts.length > 0 ? pathParts.join("/") : "repo";
    const gitUrl = raw.replace(/\/+$/, "");
    return { owner: host, name, gitUrl };
  } catch {
    return null;
  }
}

export function formatSkillRepoLabel(repo: SkillRepo): string {
  if (repo.registryUrl) {
    return repo.registryUrl;
  }
  if (repo.gitUrl) {
    return repo.gitUrl;
  }
  return `${repo.owner}/${repo.name}`;
}

export function skillRepoOpenUrl(repo: SkillRepo): string {
  if (repo.registryUrl) {
    return repo.registryUrl;
  }
  if (repo.gitUrl) {
    return repo.gitUrl;
  }
  return `https://github.com/${repo.owner}/${repo.name}`;
}

/** Match discoverable skills to a configured repo entry. */
export function skillMatchesRepo(
  skill: { repoOwner: string; repoName: string; repoBranch?: string },
  repo: SkillRepo,
): boolean {
  if (repo.registryUrl) {
    return skill.repoOwner === repo.owner && skill.repoName === "registry";
  }
  return (
    skill.repoOwner === repo.owner &&
    skill.repoName === repo.name &&
    (skill.repoBranch || "main") === (repo.branch || "main")
  );
}
