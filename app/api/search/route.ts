import { NextResponse } from "next/server";
import path from "path";
import { STORAGE_PATH, scanJson, scanDirs, readJson } from "@/lib/storage";

interface Project {
  id: string;
  name?: string;
  worktree?: string;
}

interface Session {
  id: string;
  projectID: string;
  title?: string;
}

interface Message {
  id: string;
  role: string;
}

interface Part {
  type: string;
  text?: string;
  tool?: string;
  state?: { output?: string };
}

interface SearchResult {
  type: "project" | "session" | "content";
  project?: Project;
  session?: Session;
  sessionId?: string;
  projectId?: string;
  messageId?: string;
  role?: string;
  tool?: string;
  match: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.toLowerCase();

  if (!query || query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const results: SearchResult[] = [];

  // Search projects
  const projectDir = path.join(STORAGE_PATH, "project");
  const projects = await scanJson<Project>(projectDir);
  for (const project of projects) {
    const name =
      project.name || project.worktree?.split("/").pop() || project.id;
    if (
      name.toLowerCase().includes(query) ||
      project.worktree?.toLowerCase().includes(query)
    ) {
      results.push({ type: "project", project, match: name });
    }
  }

  // Search sessions
  const sessionBaseDir = path.join(STORAGE_PATH, "session");
  for (const projectId of await scanDirs(sessionBaseDir)) {
    const sessions = await scanJson<Session>(
      path.join(sessionBaseDir, projectId),
    );
    for (const session of sessions) {
      if (session.title?.toLowerCase().includes(query)) {
        results.push({
          type: "session",
          session,
          projectId,
          match: session.title,
        });
      }
      if (results.length >= 50) break;
    }
    if (results.length >= 50) break;
  }

  // Search content
  const messageBaseDir = path.join(STORAGE_PATH, "message");
  outer: for (const sessionId of await scanDirs(messageBaseDir)) {
    const messages = await scanJson<Message>(
      path.join(messageBaseDir, sessionId),
    );
    for (const message of messages) {
      const partsDir = path.join(STORAGE_PATH, "part", message.id);
      const parts = await scanJson<Part>(partsDir);
      for (const part of parts) {
        const text = part.type === "text" ? part.text : part.state?.output;
        if (text?.toLowerCase().includes(query)) {
          const idx = text.toLowerCase().indexOf(query);
          const start = Math.max(0, idx - 40);
          const end = Math.min(text.length, idx + query.length + 40);
          const snippet =
            (start > 0 ? "..." : "") +
            text.slice(start, end) +
            (end < text.length ? "..." : "");
          results.push({
            type: "content",
            sessionId,
            messageId: message.id,
            role: message.role,
            tool: part.tool,
            match: snippet,
          });
          if (results.length >= 50) break outer;
        }
      }
    }
  }

  return NextResponse.json({ results: results.slice(0, 50) });
}
