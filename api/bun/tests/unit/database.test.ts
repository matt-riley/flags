import {afterEach, describe, expect, it} from "bun:test";
import {FlagsDatabase} from "../../src/persistence/flags-database";
import {ConflictError, NotFoundError} from "../../src/domain/errors";
import {appA, appB, applicationInput, flagA, flagInput, makeDatabase} from "../helpers";

describe("SQLite repository", () => {
  let database: FlagsDatabase;

  afterEach(() => database.close());

  it("creates the optimized schema and manages applications", () => {
    database = makeDatabase();
    expect(database.db.query("PRAGMA foreign_keys").get()).toEqual({foreign_keys: 1});
    expect(database.db.query("PRAGMA table_info(applications)").all()).toEqual(expect.arrayContaining([
      expect.objectContaining({name: "internal_id", type: "INTEGER", pk: 1}),
      expect.objectContaining({name: "id", type: "TEXT"}),
    ]));

    const created = database.createApplication(applicationInput());
    expect(created).toMatchObject({id: appA, slug: "storefront", description: "Customer-facing app"});
    expect(created.createdAt).toBe(created.updatedAt);
    expect(database.getApplication(created.id)).toEqual(created);
    expect(database.getApplication("missing")).toBeNull();
    expect(database.listApplications()).toEqual([created]);
    expect(database.listApplications("customer")).toEqual([created]);
    expect(database.listApplications("missing")).toEqual([]);

    expect(() => database.createApplication(applicationInput("storefront"))).toThrow(ConflictError);
    expect(() => database.updateApplication("missing", applicationInput())).toThrow(NotFoundError);
    const updated = database.updateApplication(appA, {name: "Web Storefront", slug: "web-storefront", description: "Updated"});
    expect(updated).toMatchObject({name: "Web Storefront", slug: "web-storefront", description: "Updated"});
    const mobile = database.createApplication(applicationInput("mobile"));
    expect(() => database.updateApplication(appA, {name: "Web Storefront", slug: "mobile", description: "Updated"})).toThrow(ConflictError);
    expect(() => database.deleteApplication("missing")).toThrow(NotFoundError);
    database.deleteApplication(mobile.id);
    expect(database.getApplication(mobile.id)).toBeNull();
  });

  it("keeps UUIDs public while managing flags and associations transactionally", () => {
    database = makeDatabase();
    database.createApplication(applicationInput());
    database.createApplication(applicationInput("mobile"));
    const created = database.createFlag(flagInput([appA, appB]));
    expect(created).toMatchObject({id: flagA, enabled: true, applicationIds: [appA, appB]});
    expect(database.db.query("SELECT typeof(internal_id) AS type FROM flags").get()).toEqual({type: "integer"});
    expect(database.getFlag(created.id)).toEqual(created);
    expect(database.getFlag("missing")).toBeNull();
    expect(database.listFlags()).toEqual([created]);
    expect(database.listFlags({search: "CHECKOUT"})).toEqual([created]);
    expect(database.listFlags({search: "not\\existent"})).toEqual([]);
    expect(database.listFlags({applicationId: appB})).toEqual([created]);
    expect(database.listFlags({search: "checkout", applicationId: appB})).toEqual([created]);
    expect(database.listFlags({applicationId: "missing"})).toEqual([]);

    expect(() => database.createFlag({...flagInput([appA, "missing"]), key: "missing_app"})).toThrow("Application not found: missing");
    expect(database.listFlags()).toHaveLength(1);
    expect(() => database.createFlag(flagInput())).toThrow(ConflictError);
    const second = database.createFlag({...flagInput([]), key: "empty_flag", name: "Empty flag", enabled: false});
    expect(second.applicationIds).toEqual([]);
    const changed = database.updateFlag(created.id, {...flagInput([appB]), key: "checkout_v2", enabled: false});
    expect(changed).toMatchObject({key: "checkout_v2", enabled: false, applicationIds: [appB]});
    expect(() => database.updateFlag("missing", flagInput())).toThrow(NotFoundError);
    expect(() => database.updateFlag(created.id, {...flagInput([appB]), key: "empty_flag"})).toThrow(ConflictError);
    expect(() => database.updateFlag(created.id, {...flagInput(["missing"]), key: "checkout_v3"})).toThrow(NotFoundError);
    expect(database.getFlag(created.id)?.key).toBe("checkout_v2");

    database.deleteApplication(appB);
    expect(database.getFlag(created.id)?.applicationIds).toEqual([]);
    expect(() => database.deleteFlag("missing")).toThrow(NotFoundError);
    database.deleteFlag(created.id);
    expect(database.getFlag(created.id)).toBeNull();
  });

  it("maps a database-generated conflict when a public UUID is reused", () => {
    database = makeDatabase([appA, appA]);
    database.createApplication(applicationInput());
    expect(() => database.createApplication(applicationInput("other"))).toThrow("slug or id already exists");
  });

  it("uses default timestamps and UUID generation when no factories are supplied", () => {
    database = new FlagsDatabase(":memory:");
    const created = database.createApplication(applicationInput("default"));
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
