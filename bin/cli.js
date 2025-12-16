#!/usr/bin/env node
import { spawn, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageDir = join(__dirname, "..");

// Read package version
const pkg = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf-8"));
const cacheDir = join(homedir(), ".cache", "opensession", pkg.version);

// Check if we need to set up the cache
const cachePackageJson = join(cacheDir, "package.json");
let needsSetup = !existsSync(cachePackageJson);

if (!needsSetup) {
  // Check if version matches
  try {
    const cachedPkg = JSON.parse(readFileSync(cachePackageJson, "utf-8"));
    needsSetup = cachedPkg.version !== pkg.version;
  } catch {
    needsSetup = true;
  }
}

if (needsSetup) {
  console.log("Setting up OpenSession Viewer...");

  // Clean old cache
  const cacheParent = join(homedir(), ".cache", "opensession");
  if (existsSync(cacheParent)) {
    rmSync(cacheParent, { recursive: true, force: true });
  }

  mkdirSync(cacheDir, { recursive: true });

  // Copy app files
  const filesToCopy = [
    "app",
    "lib",
    "package.json",
    "next.config.js",
    "tsconfig.json",
    "next-env.d.ts",
  ];
  for (const file of filesToCopy) {
    const src = join(packageDir, file);
    const dest = join(cacheDir, file);
    if (existsSync(src)) {
      cpSync(src, dest, { recursive: true });
    }
  }

  // Install dependencies
  console.log("Installing dependencies...");
  const result = spawnSync(
    "npm",
    ["install", "--silent", "--no-audit", "--no-fund"],
    {
      cwd: cacheDir,
      stdio: "inherit",
      shell: true,
    },
  );

  if (result.status !== 0) {
    console.error("Failed to install dependencies");
    process.exit(1);
  }
}

console.log(`
  ╭─────────────────────────────────────╮
  │                                     │
  │   OpenSession Viewer                │
  │   http://localhost:3456             │
  │                                     │
  │   Press Ctrl+C to stop              │
  │                                     │
  ╰─────────────────────────────────────╯
`);

const child = spawn("npx", ["next", "dev", "-p", "3456"], {
  cwd: cacheDir,
  stdio: "inherit",
  shell: true,
});

child.on("error", (err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});

child.on("close", (code) => {
  process.exit(code || 0);
});
