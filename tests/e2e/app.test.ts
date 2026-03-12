/**
 * E2E tests for the opensession Next.js server.
 *
 * ─── PURPOSE ────────────────────────────────────────────────────────────────
 * These tests start the actual Next.js development server (which loads
 * next.config.js — including the realpathSync / process.chdir workaround that
 * fixes the Windows NTFS junction bug) and then hit every API route with real
 * HTTP requests.
 *
 * If next.config.js breaks server startup, or if any route returns a 5xx
 * because of a malformed path, these tests will catch it on every OS that
 * the CI matrix runs against (ubuntu, macos, windows).
 *
 * ─── BUN TEST RUNNER (March 2026) ───────────────────────────────────────────
 * Uses bun:test for describe / it / expect / lifecycle hooks.
 * Ref: https://bun.sh/docs/cli/test
 *
 * DEVIATION: bun:test is Bun-specific; these tests cannot be run with node,
 * vitest, or jest without a compatibility shim.
 *
 * ─── SUBPROCESS SPAWNING: bunx (best practice – March 2026) ─────────────────
 * The Next.js dev server is started with:
 *   Bun.spawn(["bunx", "next", "dev", "-p", PORT])
 *
 * WHY "bunx next" instead of "./node_modules/.bin/next"
 *   On POSIX systems, `bun install` creates a shell-script shim at
 *   ./node_modules/.bin/next.  On Windows, Bun creates next.cmd and next.ps1
 *   shims but no Unix shell script.  Invoking "./node_modules/.bin/next"
 *   directly via Bun.spawn on Windows therefore fails to resolve the
 *   executable.
 *
 *   `bunx` is Bun's package runner (equivalent to npx).  It resolves the
 *   "next" binary from the local node_modules/.bin directory first, then from
 *   the global Bun store, using the platform-correct mechanism on every OS.
 *   Ref: https://bun.sh/docs/cli/bunx
 *
 * DEVIATION FROM ALTERNATIVE "bun run dev" APPROACH
 *   The package.json "dev" script hard-codes port 3456.  Using "bun run dev"
 *   would conflict with a running dev server on that port and does not allow
 *   the test to specify its own port.  "bunx next dev -p PORT" is therefore
 *   the correct approach for tests that must control the port.
 *
 * ─── Bun.spawn API (March 2026) ─────────────────────────────────────────────
 * Bun.spawn() is Bun's native subprocess API.
 * Ref: https://bun.sh/docs/api/spawn
 *
 * stdout / stderr: "pipe"
 *   Pipes both streams to ReadableStream objects on the returned Subprocess.
 *   The streams are consumed only on server startup failure to produce useful
 *   CI log output.  In the happy path, the streams are never read and are
 *   discarded when the server is killed in afterAll.
 *
 *   DEVIATION: Bun's first-party docs show consuming subprocess streams with
 *   the async iterator protocol (`for await (const chunk of subprocess.stdout)`).
 *   This file uses `new Response(subprocess.stdout).text()` instead, which
 *   buffers the entire stream via the WHATWG Fetch API Response constructor —
 *   a Bun-specific extension that accepts a ReadableStream<Uint8Array> as a
 *   Response body.  The approach is acceptable for error-path diagnostics where
 *   the full output is always small (server startup log) but would be
 *   inappropriate for large or infinite streams.
 *   Ref: https://bun.sh/docs/api/fetch (Response constructor)
 *   Ref: https://bun.sh/docs/api/spawn#output
 *
 * ─── import.meta.dir (March 2026) ───────────────────────────────────────────
 * `import.meta.dir` is Bun's equivalent of Node.js `__dirname`: the absolute
 * path to the directory containing the current module file.
 * Ref: https://bun.sh/docs/api/import-meta
 *
 * DEVIATION FROM NODE.JS: `import.meta.dir` is a Bun extension and is not
 * part of the WinterCG / WHATWG import.meta specification.  Node.js ESM
 * modules must use `import.meta.url` + `new URL('../..', import.meta.url)`
 * to derive the same path.  Bun also supports the Node.js idiom, but
 * `import.meta.dir` is shorter and idiomatic for Bun projects.
 *
 * ─── PORT SELECTION ─────────────────────────────────────────────────────────
 * Port 3457 is used (not the default 3456 in package.json "dev") to avoid
 * colliding with a developer's running instance.  It is not dynamically
 * allocated; a fixed port is sufficient because CI runners do not run user
 * services on arbitrary ports.
 *
 * ─── SERVER READINESS POLLING ───────────────────────────────────────────────
 * waitForServer polls /api/projects every 500 ms up to 60 s.  This is a
 * simple but reliable strategy for dev-server startup; Next.js dev builds can
 * take 20–45 s on a cold CI runner.  The timeout on beforeAll (90 s) is set
 * to match the per-test --timeout flag and gives the server 60 s + 30 s
 * buffer for the first request.
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
  // "bunx next" is cross-platform: bunx checks local node_modules/.bin first,
  // then the global Bun store, using the platform-correct mechanism on every OS
  // (.bin/next on Unix vs next.cmd/next.ps1 on Windows are both resolved
  // internally by Bun — callers do not need to know which shim to invoke).
  server = Bun.spawn(
    ["bunx", "next", "dev", "-p", String(PORT)],
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
