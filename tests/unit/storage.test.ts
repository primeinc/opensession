/**
 * Unit tests for lib/storage.ts — cross-platform storage helpers.
 *
 * ─── PURPOSE ────────────────────────────────────────────────────────────────
 * lib/storage.ts provides four helpers used throughout the API routes:
 *   • STORAGE_PATH  – computed path to the opencode storage directory
 *   • exists()      – non-throwing stat check
 *   • readJson()    – safe JSON file reader (null on any error)
 *   • scanJson()    – reads all *.json files from a directory
 *   • scanDirs()    – lists immediate subdirectory names
 *
 * Tests exercise real file-system operations on a temporary fixture directory
 * created in os.tmpdir() so they run correctly on Linux, macOS, and Windows
 * without any mocking.
 *
 * ─── BUN TEST RUNNER (March 2026) ───────────────────────────────────────────
 * Uses bun:test for describe / it / expect / lifecycle hooks.
 * Ref: https://bun.sh/docs/cli/test
 *
 * DEVIATION: bun:test is Bun-specific; these tests cannot be run with node,
 * vitest, or jest without a compatibility shim.
 *
 * ─── TEST FIXTURE MANAGEMENT ────────────────────────────────────────────────
 * A unique fixture directory is created in beforeAll and removed in afterAll.
 *
 * Fixture path: os.tmpdir() + "/storage-test-<pid>"
 *   • os.tmpdir() returns the platform-specific temp directory:
 *       Linux/macOS  →  /tmp  (or $TMPDIR)
 *       Windows      →  C:\Users\<user>\AppData\Local\Temp
 *     Ref: https://nodejs.org/api/os.html#ostmpdir
 *   • Including process.pid prevents collisions when the test suite runs in
 *     parallel workers (bun test --jobs N).
 *
 * DEVIATION: bun:test runs all tests in a single worker process by default
 * (unlike vitest which forks per-file).  The pid suffix is therefore redundant
 * in the default bun configuration but is kept as defensive practice and for
 * correctness should parallel test execution be enabled in the future.
 * Ref: https://bun.sh/docs/cli/test#parallelism
 *
 * ─── STORAGE_PATH CONVENTION ────────────────────────────────────────────────
 * OpenCode stores sessions at ~/.local/share/opencode/storage on all platforms
 * (Windows uses the same XDG-like path via os.homedir()).  The test asserts the
 * suffix `opencode[/\]storage` to remain correct on both POSIX and Windows path
 * separators.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// Tests for lib/storage.ts cross-platform behaviour.
// We exercise both STORAGE_PATH and the helpers that accept concrete paths,
// using temporary fixtures created below rather than relying on global state.
import {
  STORAGE_PATH,
  scanJson,
  scanDirs,
  readJson,
  exists,
} from "../../lib/storage";

// ---------------------------------------------------------------------------
// STORAGE_PATH
// ---------------------------------------------------------------------------
describe("STORAGE_PATH", () => {
  it("is a non-empty string", () => {
    expect(typeof STORAGE_PATH).toBe("string");
    expect(STORAGE_PATH.length).toBeGreaterThan(0);
  });

  it("ends with the expected opencode storage suffix", () => {
    // OpenCode uses ~/.local/share/opencode/storage on every platform
    // (Windows uses %USERPROFILE%\.local\share\opencode just like Linux/macOS)
    expect(STORAGE_PATH).toMatch(/opencode[/\\]storage$/);
  });

  it("is rooted at the user home directory", async () => {
    const { homedir } = await import("os");
    expect(STORAGE_PATH.startsWith(homedir())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

const fixtureDir = join(tmpdir(), `storage-test-${process.pid}`);

beforeAll(async () => {
  await mkdir(fixtureDir, { recursive: true });
});

afterAll(async () => {
  await rm(fixtureDir, { recursive: true, force: true });
});

describe("exists()", () => {
  it("returns true for a file that exists", async () => {
    const file = join(fixtureDir, "exists-true.json");
    await writeFile(file, "{}");
    expect(await exists(file)).toBe(true);
  });

  it("returns false for a file that does not exist", async () => {
    expect(await exists(join(fixtureDir, "no-such-file.json"))).toBe(false);
  });

  it("returns true for a path that is a directory", async () => {
    const dir = join(fixtureDir, "subdir");
    await mkdir(dir, { recursive: true });
    expect(await exists(dir)).toBe(true);
  });
});

describe("readJson()", () => {
  it("parses a valid JSON file", async () => {
    const file = join(fixtureDir, "valid.json");
    await writeFile(file, JSON.stringify({ id: "abc", value: 42 }));
    const result = await readJson<{ id: string; value: number }>(file);
    expect(result).toEqual({ id: "abc", value: 42 });
  });

  it("returns null for a file that does not exist", async () => {
    const result = await readJson(join(fixtureDir, "missing.json"));
    expect(result).toBeNull();
  });

  it("returns null for an invalid JSON file", async () => {
    const file = join(fixtureDir, "invalid.json");
    await writeFile(file, "not-valid-json{{{");
    const result = await readJson(file);
    expect(result).toBeNull();
  });
});

describe("scanJson()", () => {
  it("reads all *.json files in a directory", async () => {
    const dir = join(fixtureDir, "scan-json");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "a.json"), JSON.stringify({ id: "a" }));
    await writeFile(join(dir, "b.json"), JSON.stringify({ id: "b" }));
    await writeFile(join(dir, "c.txt"), "ignored");
    const results = await scanJson<{ id: string }>(dir);
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.id).sort()).toEqual(["a", "b"]);
  });

  it("returns an empty array for a missing directory", async () => {
    const results = await scanJson(join(fixtureDir, "does-not-exist"));
    expect(results).toEqual([]);
  });

  it("returns an empty array for an empty directory", async () => {
    const dir = join(fixtureDir, "scan-json-empty");
    await mkdir(dir, { recursive: true });
    const results = await scanJson(dir);
    expect(results).toEqual([]);
  });
});

describe("scanDirs()", () => {
  it("lists only subdirectory names", async () => {
    const dir = join(fixtureDir, "scan-dirs");
    await mkdir(join(dir, "sub1"), { recursive: true });
    await mkdir(join(dir, "sub2"), { recursive: true });
    await writeFile(join(dir, "file.json"), "{}");
    const results = await scanDirs(dir);
    expect(results.sort()).toEqual(["sub1", "sub2"]);
  });

  it("returns an empty array for a missing directory", async () => {
    const results = await scanDirs(join(fixtureDir, "no-such-dir"));
    expect(results).toEqual([]);
  });

  it("returns an empty array when no subdirectories exist", async () => {
    const dir = join(fixtureDir, "scan-dirs-no-sub");
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "only-a-file.txt"), "hello");
    const results = await scanDirs(dir);
    expect(results).toEqual([]);
  });
});
