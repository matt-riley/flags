import {Database} from "bun:sqlite";
import {ConflictError, NotFoundError} from "../domain/errors";
import type {Application, ApplicationInput, FeatureFlag, FlagInput} from "../domain/types";
import {Logger} from "../logging/logger";
import {schema} from "./schema";

export type DatabaseOptions = {
  now?: () => string;
  createId?: () => string;
  logger?: Logger;
};

type ApplicationRow = {
  internal_id: number;
  id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
  updated_at: string;
};

type FlagRow = {
  internal_id: number;
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: number;
  created_at: string;
  updated_at: string;
  application_id: string | null;
};

type InternalIdRow = {internal_id: number; id: string};

const applicationColumns = "internal_id, id, name, slug, description, created_at, updated_at";

const flagSelect = `
  SELECT f.internal_id, f.id, f.key, f.name, f.description, f.enabled,
         f.created_at, f.updated_at, a.id AS application_id
  FROM flags f
  LEFT JOIN flag_applications fa ON fa.flag_internal_id = f.internal_id
  LEFT JOIN applications a ON a.internal_id = fa.application_internal_id
`;

// SQLite's LIKE is already case-insensitive for ASCII, so no lower() is needed.
function searchClause(search: string | undefined, columns: string[]): {sql: string; params: string[]} | null {
  const term = search?.trim();
  if (!term) return null;
  const pattern = `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
  return {
    sql: `(${columns.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(" OR ")})`,
    params: columns.map(() => pattern),
  };
}

export class FlagsDatabase {
  readonly db: Database;
  private readonly now: () => string;
  private readonly createId: () => string;
  private readonly logger: Logger;

  constructor(filename = ":memory:", options: DatabaseOptions = {}) {
    this.db = new Database(filename, {create: true, strict: true});
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.createId ?? (() => crypto.randomUUID());
    this.logger = options.logger ?? Logger.discard;
    this.db.exec(schema);
    this.logger.info("database opened", {filename});
  }

  close(): void {
    this.db.close();
    this.logger.info("database closed");
  }

  listApplications(search = ""): Application[] {
    const filter = searchClause(search, ["name", "slug", "description"]);
    const rows = this.db.query(`SELECT ${applicationColumns} FROM applications ${filter ? `WHERE ${filter.sql}` : ""} ORDER BY created_at DESC, internal_id DESC`)
      .all(...(filter?.params ?? [])) as ApplicationRow[];
    return rows.map((row) => this.toApplication(row));
  }

  getApplication(id: string): Application | null {
    const row = this.db.query(`SELECT ${applicationColumns} FROM applications WHERE id = ?`).get(id) as ApplicationRow | null;
    return row ? this.toApplication(row) : null;
  }

  createApplication(input: ApplicationInput): Application {
    const timestamp = this.now();
    const conflicts = {"applications.slug": "Application slug already exists", "applications.id": "Application slug or id already exists"};
    const row = this.write(conflicts, () => this.db.query(
      `INSERT INTO applications (id, name, slug, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING ${applicationColumns}`,
    ).get(this.createId(), input.name, input.slug, input.description, timestamp, timestamp) as ApplicationRow);
    return this.toApplication(row);
  }

  updateApplication(id: string, input: ApplicationInput): Application {
    const timestamp = this.now();
    const row = this.write({"applications.slug": "Application slug already exists"}, () => this.db.query(
      `UPDATE applications SET name = ?, slug = ?, description = ?, updated_at = ? WHERE id = ? RETURNING ${applicationColumns}`,
    ).get(input.name, input.slug, input.description, timestamp, id) as ApplicationRow | null);
    if (!row) throw new NotFoundError("Application not found");
    return this.toApplication(row);
  }

  deleteApplication(id: string): void {
    const result = this.db.query("DELETE FROM applications WHERE id = ?").run(id);
    if (result.changes === 0) throw new NotFoundError("Application not found");
  }

  listFlags(options: {search?: string; applicationId?: string} = {}): FeatureFlag[] {
    const clauses: string[] = [];
    const params: string[] = [];
    const filter = searchClause(options.search, ["f.key", "f.name", "f.description"]);
    if (filter) {
      clauses.push(filter.sql);
      params.push(...filter.params);
    }
    if (options.applicationId) {
      clauses.push("f.internal_id IN (SELECT fa_filter.flag_internal_id FROM flag_applications fa_filter JOIN applications a_filter ON a_filter.internal_id = fa_filter.application_internal_id WHERE a_filter.id = ?)");
      params.push(options.applicationId);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = this.db.query(`${flagSelect} ${where} ORDER BY f.created_at DESC, f.internal_id DESC`).all(...params) as FlagRow[];
    return this.toFlags(rows);
  }

  getFlag(id: string): FeatureFlag | null {
    const rows = this.db.query(`${flagSelect} WHERE f.id = ?`).all(id) as FlagRow[];
    return this.toFlags(rows)[0] ?? null;
  }

  createFlag(input: FlagInput): FeatureFlag {
    const timestamp = this.now();
    const conflicts = {"flags.key": "Flag key already exists", "flags.id": "Flag key or id already exists"};
    const id = this.write(conflicts, () => {
      const applications = this.applicationInternalIds(input.applicationIds);
      const id = this.createId();
      const flag = this.db.query(
        "INSERT INTO flags (id, key, name, description, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING internal_id",
      ).get(id, input.key, input.name, input.description, input.enabled ? 1 : 0, timestamp, timestamp) as {internal_id: number};
      this.insertFlagApplications(flag.internal_id, applications);
      return id;
    });
    return this.getFlag(id)!;
  }

  updateFlag(id: string, input: FlagInput): FeatureFlag {
    const timestamp = this.now();
    this.write({"flags.key": "Flag key already exists"}, () => {
      const flag = this.db.query(
        "UPDATE flags SET key = ?, name = ?, description = ?, enabled = ?, updated_at = ? WHERE id = ? RETURNING internal_id",
      ).get(input.key, input.name, input.description, input.enabled ? 1 : 0, timestamp, id) as {internal_id: number} | null;
      if (!flag) throw new NotFoundError("Flag not found");
      const applications = this.applicationInternalIds(input.applicationIds);
      this.db.query("DELETE FROM flag_applications WHERE flag_internal_id = ?").run(flag.internal_id);
      this.insertFlagApplications(flag.internal_id, applications);
    });
    return this.getFlag(id)!;
  }

  deleteFlag(id: string): void {
    const result = this.db.query("DELETE FROM flags WHERE id = ?").run(id);
    if (result.changes === 0) throw new NotFoundError("Flag not found");
  }

  /** Runs `work` in a transaction, translating UNIQUE violations on the given `table.column` keys into ConflictErrors. */
  private write<T>(conflicts: Record<string, string>, work: () => T): T {
    try {
      return this.db.transaction(work)();
    } catch (error) {
      const column = error instanceof Error ? /UNIQUE constraint failed: (\S+)/.exec(error.message)?.[1] : undefined;
      const message = column && conflicts[column];
      if (message) throw new ConflictError(message);
      throw error;
    }
  }

  private applicationInternalIds(ids: string[]): InternalIdRow[] {
    if (ids.length === 0) return [];
    // One fixed statement regardless of id count, so the query cache isn't filled with IN (?, ?, ...) variants.
    const rows = this.db.query("SELECT internal_id, id FROM applications WHERE id IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(ids)) as InternalIdRow[];
    if (rows.length !== ids.length) {
      const found = new Set(rows.map((row) => row.id));
      const missing = ids.find((id) => !found.has(id));
      throw new NotFoundError(`Application not found: ${missing}`);
    }
    return rows;
  }

  private insertFlagApplications(flagInternalId: number, applications: InternalIdRow[]): void {
    const insert = this.db.query("INSERT INTO flag_applications (flag_internal_id, application_internal_id) VALUES (?, ?)");
    for (const application of applications) insert.run(flagInternalId, application.internal_id);
  }

  private toApplication(row: ApplicationRow): Application {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private toFlags(rows: FlagRow[]): FeatureFlag[] {
    const flags = new Map<number, FeatureFlag>();
    for (const row of rows) {
      let flag = flags.get(row.internal_id);
      if (!flag) {
        flag = {
          id: row.id,
          key: row.key,
          name: row.name,
          description: row.description,
          enabled: row.enabled === 1,
          applicationIds: [],
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
        flags.set(row.internal_id, flag);
      }
      if (row.application_id) flag.applicationIds.push(row.application_id);
    }
    return [...flags.values()];
  }
}
