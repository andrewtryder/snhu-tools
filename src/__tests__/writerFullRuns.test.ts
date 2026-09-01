import { beforeEach, describe, expect, it, vi } from "vitest";

const course = vi.hoisted(() => ({
  withDb: vi.fn(), fetchCourses: vi.fn(), fetchDetails: vi.fn(), parse: vi.fn(), getState: vi.fn(), claim: vi.fn(), start: vi.fn(), items: vi.fn(), insert: vi.fn(), advance: vi.fn(), promote: vi.fn(), setError: vi.fn(), report: vi.fn(),
}));
const transfer = vi.hoisted(() => ({
  create: vi.fn(), fetchExperiences: vi.fn(), fetchDetail: vi.fn(), parse: vi.fn(), getState: vi.fn(), claim: vi.fn(), start: vi.fn(), items: vi.fn(), insert: vi.fn(), advance: vi.fn(), promote: vi.fn(), setError: vi.fn(), abort: vi.fn(), report: vi.fn(),
}));

vi.mock("@/features/courses/sync/database", () => ({ withCatalogDbClient: course.withDb }));
vi.mock("@/features/courses/sync/fetch", () => ({ fetchCourses: course.fetchCourses, fetchCourseDetails: course.fetchDetails }));
vi.mock("@/features/courses/sync/parse", () => ({ parseCourse: course.parse }));
vi.mock("@/features/courses/sync/persist", () => ({ getSyncState: course.getState, tryClaimLease: course.claim, startRefresh: course.start, getSyncItemsBatch: course.items, insertStagedCourse: course.insert, advanceCursor: course.advance, promoteStaging: course.promote, setSyncError: course.setError, tryClaimBootstrapLease: vi.fn() }));
vi.mock("@/features/courses/sync/promote", () => ({ promoteStaging: course.promote }));
vi.mock("@/lib/syncReporting", () => ({ reportSyncError: course.report }));
vi.mock("@/lib/db/client", () => ({ createPgClient: transfer.create }));
vi.mock("@/features/transfers/sync/fetch", () => ({ fetchExperiences: transfer.fetchExperiences, fetchExperienceDetail: transfer.fetchDetail }));
vi.mock("@/features/transfers/sync/parse", () => ({ parseExperienceDetail: transfer.parse }));
vi.mock("@/features/transfers/sync/persist", () => ({ getSyncState: transfer.getState, tryClaimLease: transfer.claim, startRefresh: transfer.start, getSyncItems: transfer.items, insertStagedTransfer: transfer.insert, advanceCursor: transfer.advance, promoteStaging: transfer.promote, setSyncError: transfer.setError, abortToIdle: transfer.abort }));
vi.mock("@/features/transfers/sync/promote", () => ({ promoteStaging: transfer.promote }));

import { runCatalogSyncToCompletion } from "@/features/courses/sync";
import { runTransferSyncToCompletion } from "@/features/transfers/sync";

const due = new Date(0);
const future = new Date(Date.now() + 60_000);
const catalogState = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ status: "running", sync_id: "catalog-owned", cursor: 0, expected_count: 2, imported_count: 0, next_due_at: due, ...overrides });
const transferState = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({ status: "running", sync_id: "transfer-owned", cursor: 0, expected_count: 3, imported_count: 0, failed_experience_count: 0, next_due_at: due, ...overrides });

beforeEach(() => {
  vi.clearAllMocks();
  course.withDb.mockImplementation(async (_options: unknown, fn: (client: unknown) => Promise<unknown>) => fn({}));
  course.fetchCourses.mockResolvedValue([{ pid: "c1" }, { pid: "c2" }]); course.fetchDetails.mockResolvedValue({}); course.parse.mockReturnValue({});
  course.claim.mockResolvedValue(catalogState()); course.start.mockResolvedValue(undefined); course.items.mockImplementation(async (_c: unknown, _id: string, cursor: number) => [cursor === 0 ? "c1" : "c2"]); course.insert.mockResolvedValue(undefined); course.advance.mockResolvedValue(undefined); course.promote.mockResolvedValue(undefined); course.setError.mockResolvedValue(undefined); course.report.mockResolvedValue(undefined);
  const client = { connect: vi.fn().mockResolvedValue(undefined), end: vi.fn().mockResolvedValue(undefined) };
  transfer.create.mockReturnValue(client); process.env.POSTGRES_URL = "test";
  transfer.fetchExperiences.mockResolvedValue([{ pid: "t1" }, { pid: "t2" }, { pid: "t3" }]); transfer.fetchDetail.mockResolvedValue({}); transfer.parse.mockReturnValue([{}]); transfer.claim.mockResolvedValue(transferState()); transfer.start.mockResolvedValue(undefined); transfer.items.mockImplementation(async (_c: unknown, _id: string, cursor: number) => [{ pid: `t${cursor + 1}`, ordinal: cursor }]); transfer.insert.mockResolvedValue(undefined); transfer.advance.mockResolvedValue(undefined); transfer.promote.mockResolvedValue(undefined); transfer.setError.mockResolvedValue(undefined); transfer.abort.mockResolvedValue(undefined);
});

describe("runCatalogSyncToCompletion", () => {
  it("owns one due refresh across multiple batches and one client wrapper", async () => {
    course.getState.mockResolvedValueOnce(catalogState({ status: "idle", sync_id: null })).mockResolvedValueOnce(catalogState()).mockResolvedValueOnce(catalogState()).mockResolvedValueOnce(catalogState({ cursor: 1, imported_count: 1 }));
    await expect(runCatalogSyncToCompletion({ batchSize: 1 })).resolves.toMatchObject({ action: "promoted", imported: 2 });
    expect(course.withDb).toHaveBeenCalledOnce(); expect(course.claim).toHaveBeenCalledOnce(); expect(course.fetchCourses).toHaveBeenCalledOnce(); expect(course.start).toHaveBeenCalledOnce(); expect(course.advance).toHaveBeenCalledTimes(2); expect(course.promote).toHaveBeenCalledOnce();
  });
  it.each([
    ["foreign lease", catalogState({ status: "idle", sync_id: null }), "lease_held"],
    ["not due", catalogState({ status: "idle", sync_id: null, next_due_at: future }), "not_due"],
    ["awaiting bootstrap", catalogState({ status: "awaiting_bootstrap", sync_id: null }), "not_bootstrapped"],
  ])("skips %s without work", async (_name, state, reason) => {
    course.getState.mockResolvedValue(state); course.claim.mockResolvedValue(reason === "lease_held" ? null : catalogState());
    await expect(runCatalogSyncToCompletion()).resolves.toMatchObject({ action: "skipped", reason });
    expect(course.start).not.toHaveBeenCalled(); expect(course.insert).not.toHaveBeenCalled(); expect(course.promote).not.toHaveBeenCalled();
    if (reason !== "lease_held") expect(course.claim).not.toHaveBeenCalled();
  });
  it("resumes an owned running sync, forces only its initial claim, and reports ownership loss", async () => {
    course.getState.mockResolvedValueOnce(catalogState()).mockResolvedValueOnce(catalogState()).mockResolvedValueOnce(catalogState({ sync_id: "foreign" }));
    await expect(runCatalogSyncToCompletion({ batchSize: 1, ignoreLease: true })).resolves.toMatchObject({ action: "error" });
    expect(course.claim).toHaveBeenCalledExactlyOnceWith(expect.anything(), { force: true }); expect(course.fetchCourses).not.toHaveBeenCalled(); expect(course.advance).toHaveBeenCalledOnce(); expect(course.promote).not.toHaveBeenCalled(); expect(course.report).toHaveBeenCalledOnce();
  });
  it("resumes an existing sync ID to promotion without refetching its snapshot", async () => {
    course.getState.mockResolvedValueOnce(catalogState({ expected_count: 1 })).mockResolvedValueOnce(catalogState({ expected_count: 1 }));
    await expect(runCatalogSyncToCompletion()).resolves.toMatchObject({ action: "promoted" });
    expect(course.fetchCourses).not.toHaveBeenCalled(); expect(course.promote).toHaveBeenCalledOnce();
  });
  it("reports batch failures, records the error, and closes the wrapper", async () => {
    let closed = false; course.withDb.mockImplementation(async (_o: unknown, fn: (client: unknown) => Promise<unknown>) => { try { return await fn({}); } finally { closed = true; } });
    course.getState.mockResolvedValueOnce(catalogState()).mockResolvedValueOnce(catalogState()); course.fetchDetails.mockRejectedValueOnce(new Error("bad batch"));
    await expect(runCatalogSyncToCompletion()).resolves.toMatchObject({ action: "error" });
    expect(course.setError).toHaveBeenCalledOnce(); expect(course.report).toHaveBeenCalledOnce(); expect(closed).toBe(true);
  });
});

describe("runTransferSyncToCompletion", () => {
  it("owns one due refresh/client through three batches, delaying only between batches", async () => {
    const delay = vi.fn().mockResolvedValue(undefined);
    transfer.getState.mockResolvedValueOnce(transferState({ status: "idle", sync_id: null })).mockResolvedValueOnce(transferState()).mockResolvedValueOnce(transferState()).mockResolvedValueOnce(transferState({ cursor: 1, imported_count: 1 })).mockResolvedValueOnce(transferState({ cursor: 2, imported_count: 2 }));
    await expect(runTransferSyncToCompletion({ batchSize: 1, delay, allowLargeShrink: true })).resolves.toMatchObject({ action: "promoted", imported: 3 });
    const client = transfer.create.mock.results[0]?.value; expect(transfer.create).toHaveBeenCalledOnce(); expect(client.connect).toHaveBeenCalledOnce(); expect(client.end).toHaveBeenCalledOnce(); expect(transfer.claim).toHaveBeenCalledOnce(); expect(transfer.fetchExperiences).toHaveBeenCalledOnce(); expect(transfer.advance).toHaveBeenCalledTimes(3); expect(delay).toHaveBeenCalledTimes(2); expect(transfer.promote).toHaveBeenCalledWith(expect.anything(), "transfer-owned", { allowLargeShrink: true });
  });
  it.each([
    ["foreign lease", transferState({ status: "idle", sync_id: null }), "lease_held"],
    ["not due", transferState({ status: "idle", sync_id: null, next_due_at: future }), "not_due"],
  ])("skips %s without delay or source fetch", async (_name, state, reason) => {
    const delay = vi.fn(); transfer.getState.mockResolvedValue(state); transfer.claim.mockResolvedValue(reason === "lease_held" ? null : transferState());
    await expect(runTransferSyncToCompletion({ delay })).resolves.toMatchObject({ action: "skipped", reason }); expect(delay).not.toHaveBeenCalled(); expect(transfer.fetchExperiences).not.toHaveBeenCalled(); if (reason === "not_due") expect(transfer.claim).not.toHaveBeenCalled();
  });
  it("resumes without refetching, forces only the initial claim, and errors on ownership loss", async () => {
    const delay = vi.fn(); transfer.getState.mockResolvedValueOnce(transferState()).mockResolvedValueOnce(transferState()).mockResolvedValueOnce(transferState({ sync_id: "foreign" }));
    await expect(runTransferSyncToCompletion({ ignoreLease: true, delay })).resolves.toMatchObject({ action: "error" }); expect(transfer.claim).toHaveBeenCalledExactlyOnceWith(expect.anything(), { force: true }); expect(transfer.fetchExperiences).not.toHaveBeenCalled(); expect(transfer.advance).toHaveBeenCalledOnce(); expect(delay).toHaveBeenCalledOnce();
  });
  it("resumes an existing transfer snapshot to promotion without refetching", async () => {
    const delay = vi.fn();
    transfer.getState.mockResolvedValueOnce(transferState({ expected_count: 1 })).mockResolvedValueOnce(transferState({ expected_count: 1 }));
    await expect(runTransferSyncToCompletion({ delay })).resolves.toMatchObject({ action: "promoted" });
    expect(transfer.fetchExperiences).not.toHaveBeenCalled(); expect(transfer.promote).toHaveBeenCalledOnce(); expect(delay).not.toHaveBeenCalled();
  });
  it("does not delay when the first owned result promotes", async () => {
    const delay = vi.fn();
    transfer.getState.mockResolvedValueOnce(transferState({ cursor: 3, expected_count: 3 })).mockResolvedValueOnce(transferState({ cursor: 3, expected_count: 3 }));
    await expect(runTransferSyncToCompletion({ delay })).resolves.toMatchObject({ action: "promoted" });
    expect(delay).not.toHaveBeenCalled();
  });
  it("returns a terminal error without delay when processing fails", async () => {
    const delay = vi.fn(); transfer.getState.mockResolvedValueOnce(transferState()).mockResolvedValueOnce(transferState()); transfer.fetchDetail.mockRejectedValueOnce(new Error("bad batch"));
    await expect(runTransferSyncToCompletion({ delay })).resolves.toMatchObject({ action: "error" }); expect(transfer.setError).toHaveBeenCalledOnce(); expect(course.report).toHaveBeenCalledOnce(); expect(delay).not.toHaveBeenCalled();
  });
});
