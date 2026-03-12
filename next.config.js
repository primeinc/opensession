import { realpathSync } from "fs";

// Workaround for Next.js mishandling Windows NTFS junctions/symlinks.
// Next.js resolves the real path via realpathSync but then concatenates it
// with the original (junction) cwd, producing invalid doubled/tripled paths.
// See: https://github.com/vercel/next.js/issues/8238
try {
  process.chdir(realpathSync(process.cwd()));
} catch {}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
