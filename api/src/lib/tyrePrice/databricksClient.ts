import { requiredEnv, requiredHeaderSafeEnv } from "../env";

/**
 * Client for Databricks' SQL Statement Execution API
 * (https://docs.databricks.com/api/workspace/statementexecution), used to
 * read/write the tyre-price cache and lookup log tables live, per request.
 *
 * This is the first-ever *live* App -> Databricks direction in this
 * project (every other Databricks integration is Databricks -> App,
 * scheduled/batched). Chosen deliberately over Azure Table Storage despite
 * the cold-start-latency/DBU-cost tradeoff that implies -- see the
 * Tyre Price Check plan notes. Uses a dedicated, narrowly-scoped
 * service-principal token (DATABRICKS_SQL_TOKEN), not a reuse of any
 * existing credential.
 *
 * Required app settings: DATABRICKS_SQL_HOST (workspace hostname, no
 * scheme), DATABRICKS_SQL_WAREHOUSE_ID (a serverless SQL Warehouse with
 * auto-stop, for cost control), DATABRICKS_SQL_TOKEN.
 */

export class DatabricksColdStartTimeoutError extends Error {
  constructor(statementId: string) {
    super(`Databricks statement ${statementId} did not complete within the poll budget (warehouse cold start?)`);
    this.name = "DatabricksColdStartTimeoutError";
  }
}

interface DatabricksParam {
  name: string;
  value: string | number | boolean | null;
  type?: string;
}

export interface StatementResult {
  columns: string[];
  rows: unknown[][];
}

interface StatementStatusResponse {
  statement_id: string;
  status: { state: "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELED" | "CLOSED"; error?: { message?: string } };
  manifest?: { schema?: { columns?: Array<{ name: string }> } };
  result?: { data_array?: unknown[][] };
}

function config() {
  return {
    host: requiredEnv("DATABRICKS_SQL_HOST"),
    warehouseId: requiredEnv("DATABRICKS_SQL_WAREHOUSE_ID"),
    token: requiredHeaderSafeEnv("DATABRICKS_SQL_TOKEN"),
  };
}

async function pollUntilDone(
  initial: StatementStatusResponse,
  host: string,
  token: string,
  pollBudgetMs = 25000,
): Promise<StatementStatusResponse> {
  let current = initial;
  let delayMs = 500;
  const deadline = Date.now() + pollBudgetMs;

  while (current.status.state === "PENDING" || current.status.state === "RUNNING") {
    if (Date.now() >= deadline) throw new DatabricksColdStartTimeoutError(current.statement_id);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    delayMs = Math.min(delayMs * 1.5, 3000);

    const res = await fetch(`https://${host}/api/2.0/sql/statements/${current.statement_id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Databricks statement poll failed: ${res.status} ${await res.text()}`);
    current = (await res.json()) as StatementStatusResponse;
  }
  return current;
}

export async function executeStatement(
  sql: string,
  params: DatabricksParam[] = [],
  waitTimeoutSeconds = 20,
  pollBudgetMs = 25000,
): Promise<StatementResult> {
  const { host, warehouseId, token } = config();

  const submitRes = await fetch(`https://${host}/api/2.0/sql/statements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      warehouse_id: warehouseId,
      statement: sql,
      // A NULL is expressed by OMITTING `value` entirely, not by sending an
      // explicit JSON null -- several columns here are legitimately nullable
      // (load_index, price_gbp on an unavailable source, handler_email on a
      // precache row), so getting this wrong would fail most writes.
      // Timestamps are sent as ISO-8601 with an explicit `Z` rather than
      // "yyyy-MM-dd HH:mm:ss": a zone-less string would be read in the
      // warehouse's session timezone, silently skewing every cache-TTL
      // comparison if that isn't UTC.
      parameters: params.map((p) => {
        const param: { name: string; type: string; value?: string } = {
          name: p.name,
          type: p.type ?? "STRING",
        };
        if (p.value != null) param.value = String(p.value);
        return param;
      }),
      wait_timeout: `${waitTimeoutSeconds}s`,
      on_wait_timeout: "CONTINUE",
      format: "JSON_ARRAY",
      disposition: "INLINE",
    }),
  });
  if (!submitRes.ok) {
    throw new Error(`Databricks statement submit failed: ${submitRes.status} ${await submitRes.text()}`);
  }

  const submitted = (await submitRes.json()) as StatementStatusResponse;
  const final = await pollUntilDone(submitted, host, token, pollBudgetMs);

  if (final.status.state !== "SUCCEEDED") {
    throw new Error(`Databricks statement failed (${final.status.state}): ${final.status.error?.message ?? "unknown error"}`);
  }

  return {
    columns: (final.manifest?.schema?.columns ?? []).map((c) => c.name),
    rows: final.result?.data_array ?? [],
  };
}

export function rowsToObjects(result: StatementResult): Record<string, unknown>[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((col, i) => [col, row[i]])));
}
