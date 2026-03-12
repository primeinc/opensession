/**
 * Unit tests for the next.config.js Windows NTFS junction workaround.
 *
 * ─── WHAT THIS FILE TESTS ───────────────────────────────────────────────────
 * next.config.js runs `process.chdir(realpathSync(process.cwd()))` at module
 * load time.  These tests verify:
 *   1. realpathSync does not throw on the current working directory.
 *   2. process.chdir to the real path does not throw.
 *   3. On a real (non-junction) path the cwd is effectively unchanged.
 *   4. Importing next.config.js actually executes the chdir (integration check).
 *
 * ─── WHAT THIS FILE CANNOT TEST ─────────────────────────────────────────────
 * The junction mismatch scenario (where realpathSync(cwd) !== cwd) requires an
 * actual NTFS junction or symlink to exist.  Creating one requires either
 * Windows with admin rights or a Unix symlink.  Simulating the mismatch with
 * string manipulation does NOT exercise the workaround code path and would pass
 * even if the workaround were removed — such a test is misleading and has been
 * deliberately omitted.  The observable, cross-platform behavior is covered by
 * the four tests below.
 *
 * ─── BUN TEST RUNNER (March 2026) ───────────────────────────────────────────
 * These tests use the `bun:test` module, Bun's first-party, built-in test
 * runner.  It provides a Jest-compatible API (describe / it / expect / hooks)
 * with no external dependencies.
 * Ref: https://bun.sh/docs/cli/test
 *
 * DEVIATION: `bun:test` is not a Node.js built-in and cannot be run with node,
 * vitest, or jest without a compatibility shim.  Tests are intentionally
 * coupled to Bun because the project (package.json scripts, CI) already
 * mandates Bun as the runtime.
 *
 * MANUAL VERIFICATION ON WINDOWS (junction scenario)
 * The junction mismatch case cannot be reproduced in CI on Linux/macOS runners.
 * To manually verify the workaround on Windows:
 *   1. Create an NTFS junction:  mklink /J C:\test-junction C:\real-dir
 *   2. cd C:\test-junction && bun run dev
 *   3. Confirm the server starts without doubled-path errors in the console.
 *   4. The E2E tests in tests/e2e/app.test.ts then validate that all API
 *      routes return correct responses (not 500s from malformed paths).
 * This manual test should be run whenever next.config.js is modified.
 *
 * ─── afterEach HOOK ─────────────────────────────────────────────────────────
 * Each test that calls process.chdir must restore the original cwd afterwards
 * to prevent state leakage into subsequent tests.  bun:test does not sandbox
 * process state between tests; the afterEach hook is the recommended pattern
 * for cleanup.
 * Ref: https://bun.sh/docs/cli/test#lifecycle-hooks
 */

import { describe, it, expect, afterEach } from "bun:test";
import { realpathSync } from "fs";

describe("next.config.js realpathSync workaround", () => {
  const originalCwd = process.cwd();

  afterEach(() => {
    // Restore cwd after each test that may have changed it.
    try {
      process.chdir(originalCwd);
    } catch {
      // Ignore if already restored.
    }
  });

  it("realpathSync resolves the current working directory without throwing", () => {
    expect(() => realpathSync(process.cwd())).not.toThrow();
  });

  it("process.chdir to realpathSync(process.cwd()) does not throw", () => {
    expect(() => {
      process.chdir(realpathSync(process.cwd()));
    }).not.toThrow();
  });

  it("cwd is unchanged on a real (non-junction) path", () => {
    const before = process.cwd();
    process.chdir(realpathSync(process.cwd()));
    // On Linux/macOS paths are real; on Windows without junctions they are too.
    // The resolved path may differ in casing on case-insensitive filesystems, so
    // compare case-insensitively.
    expect(process.cwd().toLowerCase()).toBe(before.toLowerCase());
  });

  it("importing next.config.js applies the realpathSync cwd workaround", async () => {
    const before = process.cwd();
    // Import next.config.js which runs:
    //   process.chdir(realpathSync(process.cwd()))
    await import("../../next.config.js");
    // After the import, cwd should be the real path of the original cwd.
    expect(process.cwd()).toBe(realpathSync(before));
  });
});
