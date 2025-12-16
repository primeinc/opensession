import { NextResponse } from "next/server";
import path from "path";
import { STORAGE_PATH, scanDirs, readJson, exists } from "@/lib/storage";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;
  const baseDir = path.join(STORAGE_PATH, "session");

  for (const projectId of await scanDirs(baseDir)) {
    const filePath = path.join(baseDir, projectId, `${sessionId}.json`);
    if (await exists(filePath)) {
      const session = await readJson(filePath);
      return NextResponse.json({ session });
    }
  }

  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
