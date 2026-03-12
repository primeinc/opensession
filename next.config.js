import { realpathSync } from "fs";

// ──────────────────────────────────────────────────────────────────────────────
// WORKAROUND: Windows NTFS junction / symlink path resolution (March 2026)
//
// PROBLEM
//   On Windows, `process.cwd()` is implemented via the Win32 API
//   `GetCurrentDirectoryW`, which does NOT resolve NTFS junction points or
//   directory symlinks — it returns the path through the junction, not the
//   target.  `fs.realpathSync`, on the other hand, calls `GetFinalPathNameByHandle`
//   and DOES resolve junctions to the canonical target path.
//
//   Root cause (Node.js): https://github.com/nodejs/node/issues/34866
//     "Incorrect cwd() inside subfolders of Windows directory symlinks or
//     junctions" — process.cwd() returns the junction alias, not the real path.
//
//   When the opensession CLI is invoked from a cache directory that is an NTFS
//   junction (e.g. ~/.cache redirected to another drive), Next.js sees two
//   different representations of the same directory:
//     process.cwd()     → C:\Users\user\.cache\opensession\0.0.6   (junction alias)
//     realpathSync(cwd) → R:\real\.cache\opensession\0.0.6         (canonical path)
//
//   Next.js derives filesystem paths by joining these two values, producing
//   invalid doubled paths such as:
//     C:\Users\user\.cache\opensession\0.0.6\R:\real\.cache\opensession\0.0.6\.next\…
//
//   This causes ENOENT errors and 500 responses on every API request.
//
//   NOTE: vercel/next.js#8238 ("Build errors when project contains a symlink")
//   is a DIFFERENT bug about broken symlinks causing ENOENT during TypeScript
//   file scanning.  It is NOT related to the junction path-doubling fixed here.
//
//   The same class of path-doubling bug exists across bundlers on Windows:
//   Analogous Vite issue: https://github.com/vitejs/vite/issues/20420
//     "Vite resolves realpath on Windows when using subst drive, causing asset
//     emission failure in Rollup" — realpathSync output mixed with cwd produces
//     an absolute path that Rollup rejects for emitted assets.
//
// FIX
//   Resolve the real path *before* Next.js starts so that process.cwd() and
//   realpathSync(process.cwd()) are identical by the time Next.js reads cwd.
//   With them equal, any internal join of the two values is a no-op and paths
//   remain valid.
//
// DEVIATION FROM NEXT.JS FIRST-PARTY DOCS (March 2026)
//   The Next.js configuration reference documents next.config.js as a pure
//   export file: it should only export a configuration object and must not
//   produce observable side effects.
//   Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js
//
//   Calling `process.chdir()` at module evaluation is a side effect that runs
//   before Next.js initialises.  This is intentional and is the minimal change
//   required to work around the upstream Node.js bug; no Next.js-sanctioned API
//   exists to hook into pre-startup path resolution.
//
// ESM SYNTAX (Next.js best practice – March 2026)
//   next.config.js may use ESM `import`/`export` when the project sets
//   `"type": "module"` in package.json.  This project does so; the file
//   therefore uses a top-level `import` statement rather than `require()`.
//   Ref: https://nextjs.org/docs/app/api-reference/config/next-config-js#typescript
//
// ERROR HANDLING
//   The chdir is wrapped in try/catch because it can throw on read-only
//   filesystems or in containerised environments where the working directory
//   has been deleted.  A failure to chdir is non-fatal: the workaround simply
//   does not apply, and Next.js falls back to its default (potentially buggy)
//   behaviour on junctioned paths.  We must not let a defensive workaround
//   prevent the server from starting in normal environments.
// ──────────────────────────────────────────────────────────────────────────────
try {
  process.chdir(realpathSync(process.cwd()));
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
