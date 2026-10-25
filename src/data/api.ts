import { fieldsFromSchema, topicEntity } from "./columns";
import type { FileSummary, TopicInfo } from "./types";

/** Base URL of the session server (server/). */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

/** One row of GET /api/sessions. */
export interface ApiSession {
  id: string;
  series: string;
  season: number | null;
  round: number | null;
  event: string;
  country?: string | null;
  location?: string | null;
  circuit?: string | null;
  session: string;
  session_type?: string | null;
  scheduled_start_ns?: number | null;
  start_ns: number;
  /** start_ns as a decimal string: the number form is not exact above 2^53. */
  start_ns_str?: string;
  end_ns: number;
  duration: number;
  bytes?: number;
  message_count?: number;
  topics: string[];
  live: boolean;
  running?: boolean;
  title?: string;
  head?: number;
}

export interface ApiTopic {
  name: string;
  schema_name: string;
  schema: string;
  encoding: string;
  count: number;
}

/** GET /api/sessions/{id}. */
export interface ApiSessionDetails extends Omit<ApiSession, "topics"> {
  name: string;
  topics: ApiTopic[];
  metadata: Record<string, Record<string, string>>;
}

export function wsUrl(base: string, path: string): string {
  return base.replace(/^http/, "ws") + path;
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { signal });
  } catch {
    throw new Error(`Cannot reach the session server at ${new URL(url).origin}. Start it with \`npm run server\`.`);
  }
  if (!r.ok) throw new Error(`${url}: ${r.status} ${r.statusText}`);
  return (await r.json()) as T;
}

export function listSessions(base = API_URL, signal?: AbortSignal): Promise<ApiSession[]> {
  return getJson<ApiSession[]>(`${base}/api/sessions`, signal);
}

export function getSession(id: string, base = API_URL, signal?: AbortSignal): Promise<ApiSessionDetails> {
  return getJson<ApiSessionDetails>(`${base}/api/sessions/${encodeURIComponent(id)}`, signal);
}

export function fileUrl(id: string, base = API_URL): string {
  return `${base}/api/sessions/${encodeURIComponent(id)}/file`;
}

/** Session details in the FileSummary shape the decoder produces, so the rest of the app is unchanged. */
export function summaryFromDetails(d: ApiSessionDetails): FileSummary {
  const topics: TopicInfo[] = d.topics
    .map((t) => ({ name: t.name, schema: t.schema_name, count: t.count, ...fieldsFromSchema(t.schema), ...topicEntity(t.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    name: d.name ?? d.id,
    bytes: d.bytes ?? 0,
    startNs: d.start_ns_str ?? BigInt(Math.round(d.start_ns)).toString(),
    duration: d.duration,
    topics,
    metadata: d.metadata ?? {},
  };
}

/** Sessions grouped by event (season + round), newest first; live sessions on top. */
export function groupSessions(list: ApiSession[]): { key: string; title: string; subtitle: string; live: boolean; sessions: ApiSession[] }[] {
  const groups = new Map<string, { key: string; title: string; subtitle: string; live: boolean; sessions: ApiSession[] }>();
  for (const s of list) {
    const key = s.live ? "live" : `${s.season ?? ""}-${String(s.round ?? 0).padStart(2, "0")}-${s.event}`;
    let g = groups.get(key);
    if (!g) {
      g = s.live
        ? { key, title: "Live", subtitle: "Sessions being received now", live: true, sessions: [] }
        : { key, title: s.event, subtitle: [s.season, s.round != null ? `Round ${s.round}` : null, s.location ?? s.country].filter(Boolean).join(" · "), live: false, sessions: [] };
      groups.set(key, g);
    }
    g.sessions.push(s);
  }
  for (const g of groups.values()) g.sessions.sort((a, b) => a.start_ns - b.start_ns || a.session.localeCompare(b.session));
  return [...groups.values()].sort((a, b) => (a.live !== b.live ? (a.live ? -1 : 1) : b.key.localeCompare(a.key)));
}
