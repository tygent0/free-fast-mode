import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CacheStats, CachedEntry } from "../types.js";

interface CacheDiskShape {
  entries: Record<string, CachedEntry<unknown>>;
}

interface LocalCacheStoreOptions {
  persistToDisk?: boolean;
}

export class LocalCacheStore {
  private readonly cacheDir: string;
  private readonly cacheFile: string;
  private readonly persistToDisk: boolean;
  private memory: Record<string, CachedEntry<unknown>> = {};
  private loaded = false;
  private hits = 0;
  private misses = 0;
  private writes = 0;

  constructor(private readonly repoRoot: string, options?: LocalCacheStoreOptions) {
    this.persistToDisk = options?.persistToDisk ?? true;
    this.cacheDir = path.join(repoRoot, ".ffm-cache");
    this.cacheFile = path.join(this.cacheDir, "cache.json");
  }

  async get<T>(key: string): Promise<T | null> {
    await this.load();
    const found = this.memory[key];
    if (!found) {
      this.misses += 1;
      return null;
    }
    this.hits += 1;
    return found.value as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    await this.load();
    this.memory[key] = { key, createdAt: new Date().toISOString(), value };
    this.writes += 1;
    if (this.persistToDisk) {
      await this.persist();
    }
  }

  async clear(): Promise<void> {
    this.memory = {};
    this.loaded = !this.persistToDisk;
    if (this.persistToDisk) {
      await rm(this.cacheDir, { recursive: true, force: true });
    }
  }

  async invalidateByPrefixes(prefixes: string[]): Promise<number> {
    await this.load();
    let removed = 0;
    for (const key of Object.keys(this.memory)) {
      if (prefixes.some((prefix) => key.startsWith(prefix))) {
        delete this.memory[key];
        removed += 1;
      }
    }
    if (removed > 0) {
      if (this.persistToDisk) {
        await this.persist();
      }
    }
    return removed;
  }

  getStats(): CacheStats {
    return {
      entries: Object.keys(this.memory).length,
      hits: this.hits,
      misses: this.misses,
      writes: this.writes,
      path: this.persistToDisk ? this.cacheFile : "<memory-only>"
    };
  }

  private async load(): Promise<void> {
    if (this.loaded) {
      return;
    }
    if (!this.persistToDisk) {
      this.memory = {};
      this.loaded = true;
      return;
    }
    await mkdir(this.cacheDir, { recursive: true });
    try {
      const content = await readFile(this.cacheFile, "utf8");
      const parsed = JSON.parse(content) as CacheDiskShape;
      this.memory = parsed.entries ?? {};
    } catch {
      this.memory = {};
    }
    this.loaded = true;
  }

  private async persist(): Promise<void> {
    await mkdir(this.cacheDir, { recursive: true });
    const payload: CacheDiskShape = { entries: this.memory };
    await writeFile(this.cacheFile, JSON.stringify(payload, null, 2), "utf8");
  }
}
