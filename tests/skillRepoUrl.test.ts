import { describe, expect, it } from "vitest";
import {
  formatSkillRepoLabel,
  parseSkillRepoUrl,
  skillMatchesRepo,
  skillRepoOpenUrl,
} from "@/lib/skillRepoUrl";

describe("parseSkillRepoUrl", () => {
  it("parses GitHub shorthand", () => {
    expect(parseSkillRepoUrl("JimLiu/baoyu-skills")).toEqual({
      owner: "JimLiu",
      name: "baoyu-skills",
    });
  });

  it("parses GitHub HTTPS URL", () => {
    expect(parseSkillRepoUrl("https://github.com/ComposioHQ/awesome-claude-skills")).toEqual({
      owner: "ComposioHQ",
      name: "awesome-claude-skills",
    });
  });

  it("parses internal skill registry URL", () => {
    expect(parseSkillRepoUrl("https://skills.int.rclabenv.com/")).toEqual({
      owner: "skills.int.rclabenv.com",
      name: "registry",
      registryUrl: "https://skills.int.rclabenv.com",
    });
  });

  it("parses internal git host with path", () => {
    expect(parseSkillRepoUrl("https://git.ringcentral.com/team/skills")).toEqual({
      owner: "git.ringcentral.com",
      name: "team/skills",
      gitUrl: "https://git.ringcentral.com/team/skills",
    });
  });

  it("rejects invalid input", () => {
    expect(parseSkillRepoUrl("not-a-url")).toBeNull();
  });
});

describe("formatSkillRepoLabel", () => {
  it("shows registryUrl for registry repos", () => {
    expect(
      formatSkillRepoLabel({
        owner: "skills.int.rclabenv.com",
        name: "registry",
        branch: "main",
        enabled: true,
        registryUrl: "https://skills.int.rclabenv.com",
      }),
    ).toBe("https://skills.int.rclabenv.com");
  });
});

describe("skillRepoOpenUrl", () => {
  it("opens registry url", () => {
    expect(
      skillRepoOpenUrl({
        owner: "skills.int.rclabenv.com",
        name: "registry",
        branch: "main",
        enabled: true,
        registryUrl: "https://skills.int.rclabenv.com",
      }),
    ).toBe("https://skills.int.rclabenv.com");
  });
});

describe("skillMatchesRepo", () => {
  it("matches registry skills by owner and registry name", () => {
    const repo = {
      owner: "skills.int.rclabenv.com",
      name: "registry",
      branch: "main",
      enabled: true,
      registryUrl: "https://skills.int.rclabenv.com",
    };
    expect(
      skillMatchesRepo(
        { repoOwner: "skills.int.rclabenv.com", repoName: "registry" },
        repo,
      ),
    ).toBe(true);
  });
});
