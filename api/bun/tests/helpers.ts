import type {ApplicationInput, FlagInput} from "../src/domain/types";
import {Logger, type LogLevel} from "../src/logging/logger";
import {FlagsDatabase} from "../src/persistence/flags-database";

export type LogRecord = Record<string, any>;

/** A logger whose JSON output is parsed into `records` instead of being written to stdout. */
export function makeLogger(level: LogLevel = "debug"): {logger: Logger; records: LogRecord[]} {
  const records: LogRecord[] = [];
  return {logger: new Logger({level, sink: (line) => void records.push(JSON.parse(line))}), records};
}

export const appA = "11111111-1111-4111-8111-111111111111";
export const appB = "22222222-2222-4222-8222-222222222222";
export const flagA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const flagB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const applicationInput = (slug = "storefront"): ApplicationInput => ({
  name: "Storefront",
  slug,
  description: "Customer-facing app",
});

export const flagInput = (applicationIds: string[] = [appA]): FlagInput => ({
  key: "checkout_redesign",
  name: "Checkout redesign",
  description: "A refreshed checkout flow",
  enabled: true,
  applicationIds,
});

export function makeDatabase(ids = [appA, appB, flagA, flagB]): FlagsDatabase {
  let tick = 0;
  const availableIds = [...ids];
  return new FlagsDatabase(":memory:", {
    now: () => `2026-09-13T12:00:${String(++tick).padStart(2, "0")}Z`,
    createId: () => availableIds.shift() ?? crypto.randomUUID(),
  });
}

export function body(value: unknown, method = "POST"): RequestInit {
  return {
    method,
    headers: {"content-type": "application/json"},
    body: JSON.stringify(value),
  };
}

export function responseJson<T = any>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}
