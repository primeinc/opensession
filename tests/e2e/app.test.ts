/**
 * E2E tests for the opensession Next.js server.
 *
 * These tests start the actual Next.js development server (which loads
 * next.config.js — including the realpathSync / process.chdir workaround
 * that fixes the Windows NTFS junction bug) and then hit every API route
 * with real HTTP requests.
 *
 * If next.config.js breaks server startup, or if any route returns a 5xx
 * because of a malformed path, these tests will catch it on every OS
 * that the CI matrix runs against (ubuntu, macos, windows).
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import type { Subprocess } from "bun";

const PORT = 3457; // avoid colliding with the normal dev port
const BASE = `http://localhost:${PORT}`;

let server: Subprocess<"ignore", "pipe", "pipe"> | null = null;

/** Poll until the server responds or the timeout elapses. */
async function waitForServer(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/projects`);
      // Any non-network-error response means the server is up.
      if (res.status < 600) return;
    } catch {
      // ECONNREFUSED — server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next.js dev server did not start within ${timeoutMs}ms`);
}

beforeAll(async () => {
  // Spawn the Next.js dev server on PORT.
  // Using "./node_modules/.bin/next" avoids any npm / bun prefix ambiguity
  // and works identically on Linux, macOS, and Windows (the .bin symlinks /
  // shims are always present after `bun install`).
  server = Bun.spawn(
    ["bun", "./node_modules/.bin/next", "dev", "-p", String(PORT)],
    {
      cwd: import.meta.dir + "/../..",
      stdout: "pipe",
      stderr: "pipe",
    },
  );

  try {
    await waitForServer();
  } catch (err) {
    // Dump captured output so CI logs show why the server failed to start.
    const [stdout, stderr] = await Promise.all([
      new Response(server.stdout).text(),
      new Response(server.stderr).text(),
    ]);
    if (stdout) console.error("--- server stdout ---\n" + stdout);
    if (stderr) console.error("--- server stderr ---\n" + stderr);
    throw err;
  }
}, 90_000);

afterAll(() => {
  server?.kill();
});

// ---------------------------------------------------------------------------
// Homepage
// ---------------------------------------------------------------------------
describe("GET /", () => {
  it("returns 200 and an HTML page", async () => {
    const res = await fetch(BASE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<!DOCTYPE html>");
  });
});

// ---------------------------------------------------------------------------
// /api/projects
// ---------------------------------------------------------------------------
describe("GET /api/projects", () => {
  it("returns 200 with a projects array", async () => {
    const res = await fetch(`${BASE}/api/projects`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { projects: unknown[] };
    expect(Array.isArray(data.projects)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /api/projects/:projectId/sessions  (unknown project → empty list, not 500)
// ---------------------------------------------------------------------------
describe("GET /api/projects/:projectId/sessions", () => {
  it("returns 200 with a sessions array for an unknown project", async () => {
    const res = await fetch(`${BASE}/api/projects/nonexistent-project/sessions`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { sessions: unknown[] };
    expect(Array.isArray(data.sessions)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /api/sessions/:sessionId  (unknown session → 404, not 500)
// ---------------------------------------------------------------------------
describe("GET /api/sessions/:sessionId", () => {
  it("returns 404 for an unknown session", async () => {
    const res = await fetch(`${BASE}/api/sessions/nonexistent-session`);
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error: string };
    expect(data.error).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// /api/sessions/:sessionId/messages  (unknown session → empty list, not 500)
// ---------------------------------------------------------------------------
describe("GET /api/sessions/:sessionId/messages", () => {
  it("returns 200 with a messages array for an unknown session", async () => {
    const res = await fetch(
      `${BASE}/api/sessions/nonexistent-session/messages`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { messages: unknown[] };
    expect(Array.isArray(data.messages)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /api/messages/:messageId/parts  (unknown message → empty list, not 500)
// ---------------------------------------------------------------------------
describe("GET /api/messages/:messageId/parts", () => {
  it("returns 200 with a parts array for an unknown message", async () => {
    const res = await fetch(`${BASE}/api/messages/nonexistent-message/parts`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { parts: unknown[] };
    expect(Array.isArray(data.parts)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// /api/search  (short query → no results; valid query → results array)
// ---------------------------------------------------------------------------
describe("GET /api/search", () => {
  it("returns empty results for a query shorter than 2 chars", async () => {
    const res = await fetch(`${BASE}/api/search?q=a`);
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[] };
    expect(data.results).toEqual([]);
  });

  it("returns a results array for a valid query", async () => {
    const res = await fetch(
      `${BASE}/api/search?q=${encodeURIComponent("test")}`,
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { results: unknown[] };
    expect(Array.isArray(data.results)).toBe(true);
  });
});
