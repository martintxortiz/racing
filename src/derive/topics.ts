import type { FileSummary, TopicInfo } from "@/data/types";

/**
 * Canonical roles mapped to topic names. The first name present in the file wins, so files
 * using the canonical schema and files using f1pipe's native names both work.
 */
export const ROLE_ALIASES = {
  entities: ["/session/entities", "/drivers"],
  laps: ["/timing/laps"],
  order: ["/timing/classification", "/timing/positions"],
  intervals: ["/timing/intervals"],
  events: ["/session/events", "/race_control"],
  weather: ["/session/weather", "/weather"],
  stints: ["/timing/stints", "/stints"],
  pit: ["/timing/pit", "/pit"],
  info: ["/session/info"],
  outline: ["/track/outline"],
  corners: ["/track/corners"],
  results: ["/results/session"],
  grid: ["/results/starting_grid"],
  radio: ["/comms/radio", "/team_radio"],
  overtakes: ["/timing/overtakes"],
} as const;

export const PATTERN_ALIASES = {
  telemetry: ["/vehicle/*/telemetry", "/car/*/telemetry"],
  pose: ["/vehicle/*/pose", "/car/*/position"],
} as const;

export type Role = keyof typeof ROLE_ALIASES;
export type PatternRole = keyof typeof PATTERN_ALIASES;

export interface TopicMap {
  roles: Partial<Record<Role, string>>;
  patterns: Partial<Record<PatternRole, string>>;
  /** Topics with no entity, excluding bulk scene topics: decoded up front. */
  core: string[];
}

export function resolveTopics(summary: FileSummary): TopicMap {
  const names = new Set(summary.topics.map((t) => t.name));
  const patterns = new Set(summary.topics.map((t) => t.pattern).filter(Boolean) as string[]);
  const roles: TopicMap["roles"] = {};
  for (const [role, list] of Object.entries(ROLE_ALIASES) as [Role, readonly string[]][]) {
    const hit = list.find((n) => names.has(n));
    if (hit) roles[role] = hit;
  }
  const pats: TopicMap["patterns"] = {};
  for (const [role, list] of Object.entries(PATTERN_ALIASES) as [PatternRole, readonly string[]][]) {
    const hit = list.find((n) => patterns.has(n));
    if (hit) pats[role] = hit;
  }
  const core = summary.topics.filter((t) => !t.entity && !t.name.startsWith("/scene/")).map((t) => t.name);
  return { roles, patterns: pats, core };
}

export function topicFor(pattern: string, entity: string): string {
  return pattern.replace("*", entity);
}

/** Per-entity topics that match a pattern, e.g. all telemetry topics. */
export function entityTopics(summary: FileSummary, pattern: string): TopicInfo[] {
  return summary.topics.filter((t) => t.pattern === pattern);
}
