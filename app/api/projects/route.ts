import { NextResponse } from "next/server";
import path from "path";
import { STORAGE_PATH, scanJson } from "@/lib/storage";

interface Project {
  id: string;
  time?: { updated?: number };
}

export async function GET() {
  const dir = path.join(STORAGE_PATH, "project");
  const projects = await scanJson<Project>(dir);
  projects.sort((a, b) => (b.time?.updated || 0) - (a.time?.updated || 0));
  return NextResponse.json({ projects });
}
