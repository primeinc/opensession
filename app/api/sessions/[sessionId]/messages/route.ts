import { NextResponse } from "next/server";
import path from "path";
import { STORAGE_PATH, scanJson } from "@/lib/storage";

interface Message {
  id: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const dir = path.join(STORAGE_PATH, "message", sessionId);
  const messages = await scanJson<Message>(dir);
  messages.sort((a, b) => (a.id > b.id ? 1 : -1));
  return NextResponse.json({ messages });
}
