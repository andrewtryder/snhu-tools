import { mkdir, readFile, writeFile, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { localSnapshotRoot } from "./paths";

export interface SnapshotStore {
  readJson<T>(pathname: string): Promise<T | null>;
  writeJson(pathname: string, value: unknown, options?: { overwrite?: boolean }): Promise<void>;
  exists(pathname: string): Promise<boolean>;
  list(prefix: string): Promise<string[]>;
  remove(pathname: string): Promise<void>;
}

function assertNoSecrets(value: unknown, trail = "root"): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoSecrets(item, `${trail}[${i}]`));
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/password|secret|api[_-]?key|token|postgres_url|database_url|authorization/i.test(key)) {
      throw new Error(`Refusing to persist sensitive key in snapshot: ${trail}.${key}`);
    }
    assertNoSecrets(child, `${trail}.${key}`);
  }
}

/** Filesystem store used in tests and local/dev when Blob is not configured. */
export function createFsSnapshotStore(rootDir = localSnapshotRoot()): SnapshotStore {
  const resolve = (pathname: string) => path.join(rootDir, pathname);

  async function walkFiles(dir: string, prefix: string, out: string[]) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walkFiles(path.join(dir, entry.name), rel, out);
      } else {
        out.push(rel);
      }
    }
  }

  return {
    async readJson<T>(pathname: string): Promise<T | null> {
      try {
        const raw = await readFile(resolve(pathname), "utf8");
        if (!raw.trim()) return null;
        return JSON.parse(raw) as T;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        if (error instanceof SyntaxError) return null;
        throw error;
      }
    },

    async writeJson(pathname: string, value: unknown, options?: { overwrite?: boolean }) {
      assertNoSecrets(value);
      const full = resolve(pathname);
      await mkdir(path.dirname(full), { recursive: true });
      if (!options?.overwrite) {
        try {
          await stat(full);
          throw new Error(`Snapshot object already exists: ${pathname}`);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await writeFile(full, `${JSON.stringify(value)}\n`, "utf8");
    },

    async exists(pathname: string) {
      try {
        await stat(resolve(pathname));
        return true;
      } catch {
        return false;
      }
    },

    async list(prefix: string) {
      const out: string[] = [];
      await walkFiles(rootDir, "", out);
      return out.filter((p) => p === prefix || p.startsWith(prefix.endsWith("/") ? prefix : `${prefix}`));
    },

    async remove(pathname: string) {
      await rm(resolve(pathname), { force: true });
    },
  };
}

/** Vercel Blob-backed durable store (production). */
export async function createBlobSnapshotStore(): Promise<SnapshotStore> {
  const { put, get, list, del } = await import("@vercel/blob");

  return {
    async readJson<T>(pathname: string) {
      try {
        const result = await get(pathname, { access: "private" });
        // get() returns null for missing blobs; 304 has stream: null.
        if (!result || result.statusCode !== 200 || !result.stream) return null;
        const text = await new Response(result.stream).text();
        return JSON.parse(text) as T;
      } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },

    async writeJson(pathname: string, value: unknown, options?: { overwrite?: boolean }) {
      assertNoSecrets(value);
      await put(pathname, `${JSON.stringify(value)}\n`, {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: options?.overwrite === true,
        contentType: "application/json",
        token: process.env.BLOB_READ_WRITE_TOKEN,
      });
    },

    async exists(pathname: string) {
      const listed = await list({ prefix: pathname, limit: 20 });
      return listed.blobs.some((b) => b.pathname === pathname);
    },

    async list(prefix: string) {
      const paths: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await list({ prefix, cursor, limit: 1000 });
        for (const blob of page.blobs) paths.push(blob.pathname);
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      return paths;
    },

    async remove(pathname: string) {
      await del(pathname, { token: process.env.BLOB_READ_WRITE_TOKEN });
    },
  };
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: string }).name;
  if (name === "BlobNotFoundError") return true;
  const status =
    (error as { status?: number }).status ??
    (error as { statusCode?: number }).statusCode;
  return status === 404;
}

let cachedStore: SnapshotStore | null = null;
let cachedStoreMode: string | null = null;

/**
 * Resolve the active snapshot store.
 * - Tests / explicit FS: SNAPSHOT_STORE=fs or missing Blob token
 * - Production: Blob when BLOB_READ_WRITE_TOKEN is set
 */
export async function getSnapshotStore(): Promise<SnapshotStore> {
  const mode =
    process.env.SNAPSHOT_STORE ||
    (process.env.BLOB_READ_WRITE_TOKEN ? "blob" : "fs");

  if (cachedStore && cachedStoreMode === mode) return cachedStore;

  cachedStore = mode === "blob" ? await createBlobSnapshotStore() : createFsSnapshotStore();
  cachedStoreMode = mode;
  return cachedStore;
}

/** Test helper: reset singleton + optionally inject a store. */
export function setSnapshotStoreForTests(store: SnapshotStore | null): void {
  cachedStore = store;
  cachedStoreMode = store ? "test" : null;
}
