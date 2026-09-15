/**
 * Covers the freshness guarantee Search depends on, with both sources
 * mocked -- the same approach store.test.ts takes with the github module.
 * What matters here is which source is consulted and when, not that GitHub
 * or the filesystem behave.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./github", () => ({ getCurrentRepairers: vi.fn() }));
vi.mock("./data", () => ({ loadRepairers: vi.fn() }));

import { loadRepairers } from "./data";
import { getCurrentRepairers } from "./github";
import type { Repairer } from "./types";
import {
  CACHE_TTL_MS,
  FAILURE_BACKOFF_MS,
  getLiveRepairers,
  resetRepairerCache,
} from "./repairerSource";

function repairer(id: string, overrides: Partial<Repairer> = {}): Repairer {
  return { id, companyName: id, archivedAt: null, archivedBy: null, ...overrides } as Repairer;
}

const LIVE = [repairer("from-github")];
const BUNDLED = [repairer("from-disk")];

beforeEach(() => {
  resetRepairerCache();
  vi.useFakeTimers();
  vi.mocked(loadRepairers).mockReturnValue(BUNDLED);
  vi.mocked(getCurrentRepairers).mockResolvedValue({ data: LIVE, sha: "sha-1" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("getLiveRepairers", () => {
  it("prefers the live GitHub copy over the deployed one", async () => {
    expect(await getLiveRepairers()).toBe(LIVE);
    expect(loadRepairers).not.toHaveBeenCalled();
  });

  it("serves the cache within the TTL rather than re-reading GitHub", async () => {
    await getLiveRepairers();
    vi.advanceTimersByTime(CACHE_TTL_MS - 1);
    expect(await getLiveRepairers()).toBe(LIVE);
    expect(getCurrentRepairers).toHaveBeenCalledTimes(1);
  });

  it("re-reads once the TTL has passed, so an archive lands within a minute", async () => {
    await getLiveRepairers();
    const afterArchive = [repairer("from-github", { archivedAt: "2026-09-15T16:17:00.000Z" })];
    vi.mocked(getCurrentRepairers).mockResolvedValue({ data: afterArchive, sha: "sha-2" });

    vi.advanceTimersByTime(CACHE_TTL_MS);
    expect(await getLiveRepairers()).toBe(afterArchive);
    expect(getCurrentRepairers).toHaveBeenCalledTimes(2);
  });

  // A cold instance serving a burst of searches should cost one GitHub call,
  // not one per request.
  it("shares a single in-flight read between concurrent callers", async () => {
    const [a, b, c] = await Promise.all([
      getLiveRepairers(),
      getLiveRepairers(),
      getLiveRepairers(),
    ]);
    expect([a, b, c]).toEqual([LIVE, LIVE, LIVE]);
    expect(getCurrentRepairers).toHaveBeenCalledTimes(1);
  });
});

describe("when GitHub can't be reached", () => {
  beforeEach(() => {
    vi.mocked(getCurrentRepairers).mockRejectedValue(new Error("GitHub API 503"));
  });

  it("falls back to the deployed copy instead of throwing", async () => {
    // Search must degrade in freshness, never fail -- GitHub is not allowed
    // to become a hard dependency of the app's main screen.
    expect(await getLiveRepairers()).toBe(BUNDLED);
  });

  it("reports the failure so it isn't silent", async () => {
    const onError = vi.fn();
    await getLiveRepairers(onError);
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][1]).toBeInstanceOf(Error);
  });

  it("prefers a stale live read over the deployed copy", async () => {
    vi.mocked(getCurrentRepairers).mockResolvedValueOnce({ data: LIVE, sha: "sha-1" });
    await getLiveRepairers();

    vi.advanceTimersByTime(CACHE_TTL_MS);
    // An expired live read is still newer than a file bundled at the last
    // deploy, so it wins.
    expect(await getLiveRepairers()).toBe(LIVE);
    expect(loadRepairers).not.toHaveBeenCalled();
  });

  it("stops retrying for the backoff window, so an outage costs one call a minute", async () => {
    await getLiveRepairers();
    vi.advanceTimersByTime(FAILURE_BACKOFF_MS - 1);
    await getLiveRepairers();
    await getLiveRepairers();
    expect(getCurrentRepairers).toHaveBeenCalledTimes(1);
  });

  it("tries again once the backoff has elapsed, and recovers", async () => {
    await getLiveRepairers();
    vi.mocked(getCurrentRepairers).mockResolvedValue({ data: LIVE, sha: "sha-1" });

    vi.advanceTimersByTime(FAILURE_BACKOFF_MS);
    expect(await getLiveRepairers()).toBe(LIVE);
    expect(getCurrentRepairers).toHaveBeenCalledTimes(2);
  });
});
