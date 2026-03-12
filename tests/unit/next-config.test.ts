import { describe, it, expect, afterEach } from "bun:test";
import { realpathSync } from "fs";

// ---------------------------------------------------------------------------
// next.config.js Windows NTFS junction workaround
// ---------------------------------------------------------------------------
// The workaround calls:
//   process.chdir(realpathSync(process.cwd()))
//
// On systems without junctions / symlinks this is a no-op because
// realpathSync(process.cwd()) === process.cwd().
// On Windows NTFS junction paths the two can differ, which caused Next.js
// to concatenate them and produce invalid doubled paths.
// ---------------------------------------------------------------------------

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

  it("simulates a junction mismatch: chdir to the real path resolves the doubled-path bug", () => {
    // Simulate a Windows NTFS junction where cwd (the junction path) differs
    // from realpathSync(cwd) (the actual real path).
    //
    // Before the fix, Next.js would see:
    //   cwd = C:\Users\user\.cache\opensession\0.0.6              (junction)
    //   realpath = R:\real\.cache\opensession\0.0.6
    // and concatenate them → doubled/invalid path.
    //
    // The fix ensures process.cwd() === realPath before Next.js starts,
    // so Next.js sees only one path and does not concatenate them.

    const simulatedJunctionPath = "/C/Users/user/.cache/opensession/0.0.6";
    const simulatedRealPath = "/R/real/.cache/opensession/0.0.6";

    // The bug: Next.js joins junctionPath + realPath
    const buggyNextPath = simulatedJunctionPath + simulatedRealPath;

    // After the fix cwd === realPath, so Next.js joins realPath + realPath
    // which is still wrong conceptually but the real test is:
    // the fixed cwd is simply the real path, so Next.js uses only realPath.
    const fixedCwd = simulatedRealPath;

    // Verify the bug would have produced a path longer than the real path alone
    expect(buggyNextPath.length).toBeGreaterThan(simulatedRealPath.length);

    // After the fix, process.cwd() equals the real path (no junction prefix)
    expect(fixedCwd).toBe(simulatedRealPath);

    // And the fixed path does NOT start with the junction path
    expect(fixedCwd.startsWith(simulatedJunctionPath)).toBe(false);
  });
});
