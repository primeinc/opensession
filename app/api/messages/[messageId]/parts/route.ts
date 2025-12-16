import { NextResponse } from "next/server";
import path from "path";
import { STORAGE_PATH, scanJson } from "@/lib/storage";

interface Part {
  id: string;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await params;
  const dir = path.join(STORAGE_PATH, "part", messageId);
  const parts = await scanJson<Part>(dir);
  parts.sort((a, b) => (a.id > b.id ? 1 : -1));
  return NextResponse.json({ parts });
}
