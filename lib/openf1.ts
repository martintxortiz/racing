import { connection } from "next/server";

const api = "https://api.openf1.org/v1";

type OpenF1Session = {
  session_key: number;
  meeting_key: number;
  session_name: string;
  session_type: string;
  date_start: string;
  date_end: string;
  is_cancelled: boolean;
  circuit_short_name: string;
};

type OpenF1Meeting = {
  meeting_key: number;
  meeting_name: string;
  date_start: string;
  date_end: string;
  is_cancelled: boolean;
  circuit_short_name: string;
};

export type LibrarySession = {
  id: string;
  name: string;
  type: string;
  dateStart: string;
  startDate: string;
  startTime: string;
  importedAt: string;
  eventId: number;
  eventName: string;
  track: string;
};

export type LibraryEvent = {
  id: string;
  name: string;
  dateStart: string;
  startDate: string;
  startTime: string;
  track: string;
  sessions: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isOpenF1Session(value: unknown): value is OpenF1Session {
  return (
    isRecord(value) &&
    typeof value.session_key === "number" &&
    typeof value.meeting_key === "number" &&
    typeof value.session_name === "string" &&
    typeof value.session_type === "string" &&
    typeof value.date_start === "string" &&
    Number.isFinite(Date.parse(value.date_start)) &&
    typeof value.date_end === "string" &&
    Number.isFinite(Date.parse(value.date_end)) &&
    typeof value.is_cancelled === "boolean" &&
    typeof value.circuit_short_name === "string"
  );
}

function isOpenF1Meeting(value: unknown): value is OpenF1Meeting {
  return (
    isRecord(value) &&
    typeof value.meeting_key === "number" &&
    typeof value.meeting_name === "string" &&
    typeof value.date_start === "string" &&
    Number.isFinite(Date.parse(value.date_start)) &&
    typeof value.date_end === "string" &&
    Number.isFinite(Date.parse(value.date_end)) &&
    typeof value.is_cancelled === "boolean" &&
    typeof value.circuit_short_name === "string"
  );
}

async function getEndpoint(path: string): Promise<unknown[]> {
  const response = await fetch(`${api}/${path}`, {
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`OpenF1 request failed: ${path}`);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new Error(`Invalid OpenF1 response: ${path}`);
  return data;
}

function splitDateTime(value: string) {
  const offset = value.match(/(?:Z|[+-]\d{2}:\d{2})$/)?.[0];
  return {
    date: value.slice(0, 10),
    time: `${value.slice(11, 19)} ${offset && offset !== "Z" ? `GMT${offset}` : "UTC"}`,
  };
}

export async function getOpenF1LibraryData() {
  const [sessionData, meetingData] = await Promise.all([
    getEndpoint("sessions"),
    getEndpoint("meetings"),
  ]);
  const meetings = meetingData.filter(isOpenF1Meeting);
  await connection();
  const now = Date.now();
  const completedMeetings = meetings.filter(
    (meeting) => !meeting.is_cancelled && Date.parse(meeting.date_end) < now,
  );
  const meetingsById = new Map(
    meetings.map((meeting) => [meeting.meeting_key, meeting]),
  );
  const importedAt = new Date().toISOString();

  const sessions = sessionData
    .filter(isOpenF1Session)
    .filter(
      (session) => !session.is_cancelled && Date.parse(session.date_end) < now,
    )
    .flatMap((session): LibrarySession[] => {
      const meeting = meetingsById.get(session.meeting_key);
      if (!meeting) return [];
      const dateTime = splitDateTime(session.date_start);
      return [
        {
          id: String(session.session_key),
          name: session.session_name,
          type: session.session_type,
          dateStart: session.date_start,
          startDate: dateTime.date,
          startTime: dateTime.time,
          importedAt,
          eventId: session.meeting_key,
          eventName: meeting.meeting_name,
          track: session.circuit_short_name,
        },
      ];
    })
    .sort((a, b) => Date.parse(b.dateStart) - Date.parse(a.dateStart));

  const sessionsByEvent = new Map<number, LibrarySession[]>();
  for (const session of sessions) {
    const eventSessions = sessionsByEvent.get(session.eventId) ?? [];
    eventSessions.push(session);
    sessionsByEvent.set(session.eventId, eventSessions);
  }

  const events: LibraryEvent[] = completedMeetings
    .map((meeting) => {
      const eventSessions = sessionsByEvent.get(meeting.meeting_key) ?? [];
      const dateStart = eventSessions[0]?.dateStart ?? meeting.date_start;
      const dateTime = splitDateTime(dateStart);
      return {
        id: String(meeting.meeting_key),
        name: meeting.meeting_name,
        dateStart,
        startDate: eventSessions[0]?.startDate ?? dateTime.date,
        startTime: eventSessions[0]?.startTime ?? dateTime.time,
        track: meeting.circuit_short_name,
        sessions: eventSessions.map((session) => session.name),
      };
    })
    .sort((a, b) => Date.parse(b.dateStart) - Date.parse(a.dateStart));

  return { sessions, events };
}
