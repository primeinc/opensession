import { NextResponse } from "next/server";
import path from "path";
import { STORAGE_PATH, scanJson } from "@/lib/storage";

interface Session {
  id: string;
  time?: { updated?: number };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const dir = path.join(STORAGE_PATH, "session", projectId);
  const sessions = await scanJson<Session>(dir);
  sessions.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
  return NextResponse.json({ sessions });
}
