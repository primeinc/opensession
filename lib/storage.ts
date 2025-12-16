import path from "path";
import os from "os";
import fs from "fs/promises";

export const STORAGE_PATH = path.join(
  os.homedir(),
  ".local/share/opencode/storage",
);

export async function scanJson<T>(dir: string): Promise<T[]> {
  const results: T[] = [];
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      const content = await fs.readFile(path.join(dir, entry), "utf-8");
      results.push(JSON.parse(content));
    }
  } catch {}
  return results;
}

export async function scanDirs(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

export async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
