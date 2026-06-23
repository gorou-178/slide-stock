/**
 * Backfill thumbnail_url for existing stocks.
 *
 * Usage:
 *   npm run thumbnails:backfill
 *   npm run thumbnails:backfill -- --apply --limit 50
 *   npm run thumbnails:backfill -- --remote --apply
 */

import { execFileSync } from "node:child_process";
import {
  fetchDocswellMetadata,
  fetchOgpThumbnailUrl,
  fetchSpeakerDeckMetadata,
} from "../worker/lib/oembed";

type Provider = "speakerdeck" | "docswell" | "google_slides";

interface StockRow {
  id: string;
  provider: Provider;
  canonical_url: string;
}

interface CliOptions {
  apply: boolean;
  database: string;
  limit: number;
  local: boolean;
  timeoutMs: number;
}

interface D1ExecuteResult<T> {
  results?: T[];
  success?: boolean;
  error?: string;
}

interface Summary {
  found: number;
  updated: number;
  skipped: number;
  failed: number;
}

const DEFAULT_DATABASE = "slide-stock-db";
const DEFAULT_LIMIT = 100;
const DEFAULT_TIMEOUT_MS = 5_000;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const mode = options.local ? "local" : "remote";
  const action = options.apply ? "apply" : "dry-run";

  console.log(
    `[thumbnail-backfill] start mode=${mode} action=${action} database=${options.database} limit=${options.limit}`,
  );

  let rows: StockRow[];
  try {
    rows = selectTargetStocks(options);
  } catch (error) {
    printD1Error("バックフィル対象の取得に失敗しました", error);
    process.exitCode = 1;
    return;
  }

  const summary: Summary = {
    found: rows.length,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  if (rows.length === 0) {
    console.log("[thumbnail-backfill] 対象レコードはありません");
    printSummary(summary);
    return;
  }

  for (const row of rows) {
    try {
      const thumbnailUrl = await fetchThumbnailForStock(row, options.timeoutMs);
      if (!thumbnailUrl) {
        summary.skipped += 1;
        console.log(
          `[thumbnail-backfill] skip stock=${row.id} provider=${row.provider} reason=thumbnail_not_found`,
        );
        continue;
      }

      if (options.apply) {
        updateThumbnailUrl(options, row.id, thumbnailUrl);
        summary.updated += 1;
        console.log(
          `[thumbnail-backfill] updated stock=${row.id} provider=${row.provider} thumbnail_url=${thumbnailUrl}`,
        );
      } else {
        summary.skipped += 1;
        console.log(
          `[thumbnail-backfill] dry-run stock=${row.id} provider=${row.provider} thumbnail_url=${thumbnailUrl}`,
        );
      }
    } catch (error) {
      summary.failed += 1;
      console.error(
        `[thumbnail-backfill] error stock=${row.id} provider=${row.provider} canonical_url=${row.canonical_url} message=${formatError(error)}`,
      );
    }
  }

  printSummary(summary);
  if (summary.failed > 0) process.exitCode = 1;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    apply: false,
    database: DEFAULT_DATABASE,
    limit: DEFAULT_LIMIT,
    local: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    switch (arg) {
      case "--apply":
        options.apply = true;
        break;
      case "--dry-run":
        options.apply = false;
        break;
      case "--local":
        options.local = true;
        break;
      case "--remote":
        options.local = false;
        break;
      case "--database":
        options.database = readValue(args, i, arg);
        i += 1;
        break;
      case "--limit":
        options.limit = parsePositiveInteger(readValue(args, i, arg), arg);
        i += 1;
        break;
      case "--timeout-ms":
        options.timeoutMs = parsePositiveInteger(readValue(args, i, arg), arg);
        i += 1;
        break;
      case "--help":
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function readValue(args: string[], index: number, optionName: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`${optionName} requires a value`);
  }
  return value;
}

function parsePositiveInteger(value: string, optionName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${optionName} must be a positive integer`);
  }
  return parsed;
}

function selectTargetStocks(options: CliOptions): StockRow[] {
  const sql = `
    SELECT id, provider, canonical_url
    FROM stocks
    WHERE thumbnail_url IS NULL OR thumbnail_url = ''
    ORDER BY created_at ASC, id ASC
    LIMIT ${options.limit}
  `;
  return executeD1<StockRow>(options, sql);
}

function updateThumbnailUrl(
  options: CliOptions,
  stockId: string,
  thumbnailUrl: string,
): void {
  const now = new Date().toISOString();
  const sql = `
    UPDATE stocks
    SET thumbnail_url = ${escapeSQL(thumbnailUrl)},
        updated_at = ${escapeSQL(now)}
    WHERE id = ${escapeSQL(stockId)}
      AND (thumbnail_url IS NULL OR thumbnail_url = '')
  `;
  executeD1(options, sql);
}

function executeD1<T>(options: CliOptions, sql: string): T[] {
  const args = [
    "wrangler",
    "d1",
    "execute",
    options.database,
    options.local ? "--local" : "--remote",
    "--command",
    sql,
    "--json",
  ];

  let output: string;
  try {
    output = execFileSync("npx", args, {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(extractCommandError(error));
  }

  const parsed = JSON.parse(output) as D1ExecuteResult<T>[] | { error?: { text?: string } };
  if (!Array.isArray(parsed)) {
    throw new Error(parsed.error?.text ?? "Unexpected wrangler response");
  }

  const first = parsed[0];
  if (!first?.success) {
    throw new Error(first?.error ?? "D1 execute failed");
  }

  return first.results ?? [];
}

async function fetchThumbnailForStock(
  row: StockRow,
  timeoutMs: number,
): Promise<string | null> {
  const signal = AbortSignal.timeout(timeoutMs);

  if (row.provider === "speakerdeck") {
    try {
      const metadata = await fetchSpeakerDeckMetadata(row.canonical_url, signal);
      if (metadata.thumbnailUrl) return metadata.thumbnailUrl;
    } catch (error) {
      console.warn(
        `[thumbnail-backfill] warn stock=${row.id} provider=${row.provider} step=oembed message=${formatError(error)}`,
      );
    }
    return fetchOgpThumbnailUrl(row.canonical_url, row.provider, AbortSignal.timeout(timeoutMs));
  }

  if (row.provider === "docswell") {
    try {
      const metadata = await fetchDocswellMetadata(row.canonical_url, signal);
      if (metadata.thumbnailUrl) return metadata.thumbnailUrl;
    } catch (error) {
      console.warn(
        `[thumbnail-backfill] warn stock=${row.id} provider=${row.provider} step=oembed message=${formatError(error)}`,
      );
    }
    return fetchOgpThumbnailUrl(row.canonical_url, row.provider, AbortSignal.timeout(timeoutMs));
  }

  if (row.provider === "google_slides") {
    return fetchOgpThumbnailUrl(row.canonical_url, row.provider, signal);
  }

  return null;
}

function escapeSQL(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function printD1Error(message: string, error: unknown): void {
  const detail = formatError(error);
  console.error(`[thumbnail-backfill] error ${message}: ${detail}`);

  if (detail.includes("no such table: stocks")) {
    console.error(
      "[thumbnail-backfill] hint ローカル DB が未初期化の可能性があります。先に npm run db:migrate:local を実行してください。",
    );
  }
}

function printSummary(summary: Summary): void {
  console.log(
    `[thumbnail-backfill] summary found=${summary.found} updated=${summary.updated} skipped=${summary.skipped} failed=${summary.failed}`,
  );
}

function printUsage(): void {
  console.log(`Usage:
  npm run thumbnails:backfill
  npm run thumbnails:backfill -- --apply --limit 50
  npm run thumbnails:backfill -- --remote --apply

Options:
  --apply              Update DB. Default is dry-run.
  --dry-run            Fetch thumbnails without updating DB.
  --local              Use local D1. Default.
  --remote             Use remote D1.
  --database <name>    D1 database name. Default: ${DEFAULT_DATABASE}
  --limit <n>          Max target rows. Default: ${DEFAULT_LIMIT}
  --timeout-ms <n>     Fetch timeout per stock step. Default: ${DEFAULT_TIMEOUT_MS}
`);
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function extractCommandError(error: unknown): string {
  const commandError = error as {
    stdout?: string | Buffer;
    stderr?: string | Buffer;
    message?: string;
  };

  const stdout = bufferToString(commandError.stdout);
  const stderr = bufferToString(commandError.stderr);

  const wranglerError = parseWranglerError(stdout) ?? parseWranglerError(stderr);
  if (wranglerError) return wranglerError;

  const details = [stderr.trim(), stdout.trim()].filter(Boolean).join(" / ");
  return details || commandError.message || String(error);
}

function bufferToString(value: string | Buffer | undefined): string {
  if (!value) return "";
  return Buffer.isBuffer(value) ? value.toString("utf8") : value;
}

function parseWranglerError(output: string): string | null {
  if (!output.trim()) return null;
  try {
    const parsed = JSON.parse(output) as { error?: { text?: string } };
    return parsed.error?.text ?? null;
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(`[thumbnail-backfill] fatal ${formatError(error)}`);
  process.exit(1);
});
