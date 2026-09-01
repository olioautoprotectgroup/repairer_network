import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkTokenExpiry } from "./tokenExpiry";

const fetchMock = vi.fn();

function tokenListResponse(tokenInfos: unknown[]) {
  return new Response(JSON.stringify({ token_infos: tokenInfos }), { status: 200 });
}

function daysFromNow(days: number): number {
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.DATABRICKS_SQL_HOST = "example.azuredatabricks.net";
  process.env.DATABRICKS_SQL_TOKEN = "token-abc";
  delete process.env.TYRE_PRICE_TOKEN_EXPIRY_WARNING_DAYS;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DATABRICKS_SQL_HOST;
  delete process.env.DATABRICKS_SQL_TOKEN;
  delete process.env.TYRE_PRICE_TOKEN_EXPIRY_WARNING_DAYS;
});

describe("checkTokenExpiry", () => {
  it("reports 'ok' with days remaining when the token is comfortably valid", async () => {
    fetchMock.mockResolvedValue(tokenListResponse([{ token_id: "t1", expiry_time: daysFromNow(60) }]));
    const result = await checkTokenExpiry();
    expect(result.status).toBe("ok");
    expect(result.daysRemaining).toBeGreaterThan(50);
    expect(result.expiresAt).toBeTruthy();
  });

  it("reports 'expiring' inside the warning window", async () => {
    fetchMock.mockResolvedValue(tokenListResponse([{ token_id: "t1", expiry_time: daysFromNow(5) }]));
    const result = await checkTokenExpiry();
    expect(result.status).toBe("expiring");
    // Days remaining floors, so a token 5 days out reports 4 once any time has
    // elapsed. That's deliberate: an expiry warning should under-report time
    // left rather than over-report it.
    expect(result.daysRemaining).toBeGreaterThanOrEqual(4);
    expect(result.daysRemaining).toBeLessThanOrEqual(5);
    expect(result.detail).toMatch(/expires in \d+ day/);
  });

  it("honours a custom warning threshold", async () => {
    process.env.TYRE_PRICE_TOKEN_EXPIRY_WARNING_DAYS = "45";
    fetchMock.mockResolvedValue(tokenListResponse([{ token_id: "t1", expiry_time: daysFromNow(30) }]));
    expect((await checkTokenExpiry()).status).toBe("expiring");
  });

  it("reports 'expired' once the expiry has passed", async () => {
    fetchMock.mockResolvedValue(tokenListResponse([{ token_id: "t1", expiry_time: daysFromNow(-1) }]));
    const result = await checkTokenExpiry();
    expect(result.status).toBe("expired");
    expect(result.detail).toMatch(/failing until it is replaced/);
  });

  it("reports 'no-expiry' for a non-expiring token", async () => {
    fetchMock.mockResolvedValue(tokenListResponse([{ token_id: "t1", expiry_time: -1 }]));
    const result = await checkTokenExpiry();
    expect(result.status).toBe("no-expiry");
    expect(result.daysRemaining).toBeNull();
  });

  it("picks the soonest-expiring token when several are visible, and says so", async () => {
    // Warning early about the wrong token is recoverable; missing a real
    // expiry is not.
    fetchMock.mockResolvedValue(
      tokenListResponse([
        { token_id: "t1", expiry_time: daysFromNow(90) },
        { token_id: "t2", expiry_time: daysFromNow(3) },
      ]),
    );
    const result = await checkTokenExpiry();
    expect(result.status).toBe("expiring");
    expect(result.detail).toMatch(/2 tokens visible/);
  });

  it("returns 'unknown' rather than throwing when listing tokens is forbidden", async () => {
    // Listing tokens is a separate permission from using the warehouse, so a
    // 403 here says nothing about whether the sync works.
    fetchMock.mockResolvedValue(new Response("forbidden", { status: 403 }));
    const result = await checkTokenExpiry();
    expect(result.status).toBe("unknown");
    expect(result.detail).toMatch(/does not affect the sync itself/);
  });

  it("returns 'unknown' rather than throwing on a network failure", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    const result = await checkTokenExpiry();
    expect(result.status).toBe("unknown");
    expect(result.detail).toMatch(/network down/);
  });

  it("returns 'unknown' rather than throwing when the app settings are missing", async () => {
    delete process.env.DATABRICKS_SQL_HOST;
    const result = await checkTokenExpiry();
    expect(result.status).toBe("unknown");
    expect(result.detail).toMatch(/DATABRICKS_SQL_HOST/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 'unknown' when no tokens are visible", async () => {
    fetchMock.mockResolvedValue(tokenListResponse([]));
    expect((await checkTokenExpiry()).status).toBe("unknown");
  });
});
