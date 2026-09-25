import "@testing-library/jest-dom/vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach } from "vitest";
import {
  createFsSnapshotStore,
  setSnapshotStoreForTests,
} from "@/lib/snapshots/store";

// Isolate durable snapshots from any local `.data/snapshots` leftovers.
const testSnapshotRoot = mkdtempSync(path.join(tmpdir(), "snhu-vitest-snapshots-"));
process.env.SNAPSHOT_STORE = "fs";
process.env.SNAPSHOT_STORE_DIR = testSnapshotRoot;
setSnapshotStoreForTests(createFsSnapshotStore(testSnapshotRoot));

afterEach(() => {
  setSnapshotStoreForTests(createFsSnapshotStore(testSnapshotRoot));
});

// Mock ResizeObserver for React Flow in JSDOM tests
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
