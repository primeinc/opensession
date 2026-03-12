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

  it("importing next.config.js applies the realpathSync cwd workaround", async () => {
    const before = process.cwd();
    // Import next.config.js which runs:
    //   process.chdir(realpathSync(process.cwd()))
    await import("../../next.config.js");
    // After the import, cwd should be the real path of the original cwd.
    expect(process.cwd()).toBe(realpathSync(before));
  });
});
