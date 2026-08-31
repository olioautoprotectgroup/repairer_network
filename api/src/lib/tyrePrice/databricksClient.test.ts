import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabricksColdStartTimeoutError, executeStatement, rowsToObjects } from "./databricksClient";

/**
 * Covers the request-body assembly, which the cache/log tests can't reach --
 * they mock this whole module out. The NULL handling in particular is a real
 * contract with the Databricks API (omit `value`, don't send JSON null) that
 * nothing else would catch if it regressed.
 *
 * Note this verifies the shape the app *sends*, not that Databricks accepts
 * it -- no credentials or network here. The real API is exercised by
 * repairer_network_databricks/notebooks/smoke_test_tyre_price_sql_api.py.
 */
const fetchMock = vi.fn();

function succeededResponse(columns: string[] = [], rows: unknown[][] = []) {
  return new Response(
    JSON.stringify({
      statement_id: "stmt-1",
      status: { state: "SUCCEEDED" },
      manifest: { schema: { columns: columns.map((name) => ({ name })) } },
      result: { data_array: rows },
    }),
    { status: 200 },
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  process.env.DATABRICKS_SQL_HOST = "example.azuredatabricks.net";
  process.env.DATABRICKS_SQL_WAREHOUSE_ID = "wh-123";
  process.env.DATABRICKS_SQL_TOKEN = "token-abc";
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DATABRICKS_SQL_HOST;
  delete process.env.DATABRICKS_SQL_WAREHOUSE_ID;
  delete process.env.DATABRICKS_SQL_TOKEN;
});

describe("executeStatement request body", () => {
  it("omits `value` entirely for a null parameter, rather than sending JSON null", async () => {
    fetchMock.mockResolvedValue(succeededResponse());
    await executeStatement("SELECT 1", [{ name: "maybeNull", value: null }]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parameters).toEqual([{ name: "maybeNull", type: "STRING" }]);
    expect(Object.keys(body.parameters[0])).not.toContain("value");
  });

  it("stringifies non-null values and defaults the type to STRING", async () => {
    fetchMock.mockResolvedValue(succeededResponse());
    await executeStatement("SELECT 1", [
      { name: "text", value: "hello" },
      { name: "num", value: 104.99, type: "DOUBLE" },
      { name: "flag", value: false, type: "BOOLEAN" },
    ]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parameters).toEqual([
      { name: "text", type: "STRING", value: "hello" },
      { name: "num", type: "DOUBLE", value: "104.99" },
      { name: "flag", type: "BOOLEAN", value: "false" },
    ]);
  });

  it("sends `false` as a value rather than dropping it as falsy", async () => {
    // run_flat is a real BOOLEAN column that is false far more often than
    // true -- treating falsy as null would make every standard tyre NULL.
    fetchMock.mockResolvedValue(succeededResponse());
    await executeStatement("SELECT 1", [{ name: "runFlat", value: false, type: "BOOLEAN" }]);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parameters[0].value).toBe("false");
  });

  it("sends the warehouse id, wait_timeout and inline JSON_ARRAY disposition", async () => {
    fetchMock.mockResolvedValue(succeededResponse());
    await executeStatement("SELECT 1", [], 20);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.azuredatabricks.net/api/2.0/sql/statements");
    expect(init.headers.Authorization).toBe("Bearer token-abc");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      warehouse_id: "wh-123",
      statement: "SELECT 1",
      wait_timeout: "20s",
      on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY",
      disposition: "INLINE",
    });
  });
});

describe("executeStatement result handling", () => {
  it("returns columns and rows from an immediately-succeeded statement", async () => {
    fetchMock.mockResolvedValue(succeededResponse(["a", "b"], [[1, "x"]]));
    const result = await executeStatement("SELECT 1");
    expect(result).toEqual({ columns: ["a", "b"], rows: [[1, "x"]] });
  });

  it("polls until the statement leaves PENDING", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ statement_id: "stmt-1", status: { state: "PENDING" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(succeededResponse(["a"], [[1]]));

    const result = await executeStatement("SELECT 1");
    expect(result.rows).toEqual([[1]]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://example.azuredatabricks.net/api/2.0/sql/statements/stmt-1");
  });

  it("throws a distinct cold-start error when it never leaves PENDING", async () => {
    // A Response body can only be read once, so each poll needs a fresh one.
    fetchMock.mockImplementation(
      async () => new Response(JSON.stringify({ statement_id: "stmt-1", status: { state: "PENDING" } }), { status: 200 }),
    );
    // Tiny budget so this doesn't sit for the real 25s.
    await expect(executeStatement("SELECT 1", [], 20, 10)).rejects.toBeInstanceOf(DatabricksColdStartTimeoutError);
  });

  it("surfaces the API's own error message when the statement FAILS", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ statement_id: "stmt-1", status: { state: "FAILED", error: { message: "cannot resolve :cacheKey" } } }),
        { status: 200 },
      ),
    );
    await expect(executeStatement("MERGE ...")).rejects.toThrow("cannot resolve :cacheKey");
  });

  it("surfaces the response body when the submit itself is rejected", async () => {
    fetchMock.mockResolvedValue(new Response("bad parameter type", { status: 400 }));
    await expect(executeStatement("SELECT 1")).rejects.toThrow(/400 bad parameter type/);
  });

  it("throws a clear error when a required app setting is missing", async () => {
    delete process.env.DATABRICKS_SQL_WAREHOUSE_ID;
    await expect(executeStatement("SELECT 1")).rejects.toThrow("DATABRICKS_SQL_WAREHOUSE_ID");
  });
});

describe("rowsToObjects", () => {
  it("zips columns and rows into objects", () => {
    expect(rowsToObjects({ columns: ["a", "b"], rows: [[1, "x"], [2, "y"]] })).toEqual([
      { a: 1, b: "x" },
      { a: 2, b: "y" },
    ]);
  });
});
