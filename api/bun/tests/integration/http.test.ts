import {afterEach, describe, expect, it} from "bun:test";
import {FlagsDatabase} from "../../src/persistence/flags-database";
import type {Application, FeatureFlag} from "../../src/domain/types";
import type {Logger} from "../../src/logging/logger";
import {handleRequest} from "../../src/http/router";
import {createServer} from "../../src/server";
import {appA, appB, applicationInput, flagA, flagInput, makeDatabase, makeLogger, body, responseJson, type LogRecord} from "../helpers";

describe("HTTP API integration", () => {
  let database: FlagsDatabase;
  let server: ReturnType<typeof createServer>;
  let logger: Logger;
  let records: LogRecord[];

  afterEach(() => {
    server?.stop();
    database?.close();
  });

  function start(): void {
    database = makeDatabase();
    ({logger, records} = makeLogger());
    server = createServer({database, logger, port: 0});
  }

  async function request(path: string, init?: RequestInit): Promise<Response> {
    return fetch(new URL(path, server.url), init);
  }

  it("supports application CRUD, search, partial updates, and CORS", async () => {
    start();
    expect(records).toContainEqual(expect.objectContaining({level: "INFO", msg: "server listening", url: server.url.href}));

    const health = await request("/health", {headers: {"x-request-id": "trace-123"}});
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBe("trace-123");
    expect(await responseJson<{status: string}>(health)).toEqual({status: "ok"});
    expect(records).toContainEqual(expect.objectContaining({
      level: "INFO", msg: "request completed", request_id: "trace-123", method: "GET", path: "/health", status: 200, duration_ms: expect.any(Number),
    }));

    expect((await request("/applications", body({}))).status).toBe(400);
    const createdResponse = await request("/applications", body(applicationInput()));
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("access-control-allow-origin")).toBe("*");
    const created = await responseJson<Application>(createdResponse);
    expect(created.id).toBe(appA);
    expect(records).toContainEqual(expect.objectContaining({
      msg: "application created", application_id: appA, slug: "storefront", request_id: createdResponse.headers.get("x-request-id"),
    }));
    expect((await request(`/applications/${appA}`)).status).toBe(200);
    expect(await responseJson<Application[]>(await request("/applications?q=STO"))).toEqual([created]);
    expect(records).toContainEqual(expect.objectContaining({level: "DEBUG", msg: "applications listed", count: 1, search: "STO"}));
    expect(await responseJson<Application[]>(await request("/applications?search=missing"))).toEqual([]);
    expect((await request("/applications/missing")).status).toBe(404);

    const patched = await request(`/applications/${appA}`, body({description: "Patched"}, "PATCH"));
    expect(patched.status).toBe(200);
    expect((await responseJson<Application>(patched)).description).toBe("Patched");
    expect(records).toContainEqual(expect.objectContaining({msg: "application updated", application_id: appA, fields: ["description"]}));
    const replaced = await request(`/applications/${appA}`, body({name: "Web", slug: "web", description: "Replaced"}, "PUT"));
    expect((await responseJson<Application>(replaced)).slug).toBe("web");
    expect((await request(`/applications/${appA}`, body({name: "only"}, "PATCH"))).status).toBe(200);
    expect((await request(`/applications/${appA}`, body({}, "PATCH"))).status).toBe(400);
    expect((await request(`/applications/${appA}`, body({description: "bad"}))).status).toBe(405);
    expect((await request("/applications", {method: "PUT"})).status).toBe(405);
    expect((await request(`/applications/${appA}`, {method: "DELETE"})).status).toBe(204);
    expect(records).toContainEqual(expect.objectContaining({msg: "application deleted", application_id: appA}));
    expect((await request(`/applications/${appA}`, {method: "DELETE"})).status).toBe(404);
    const preflight = await request("/applications", {method: "OPTIONS"});
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("PATCH");
    expect(preflight.headers.get("access-control-expose-headers")).toBe("x-request-id");
  });

  it("supports flag CRUD, filtering, aliases, validation, and association cleanup", async () => {
    start();
    await request("/applications", body(applicationInput()));
    await request("/applications", body(applicationInput("mobile")));

    expect((await request("/feature-flags", body({}))).status).toBe(400);
    const createdResponse = await request("/feature-flags", body(flagInput([appA, appB])));
    expect(createdResponse.status).toBe(201);
    const created = await responseJson<FeatureFlag>(createdResponse);
    expect(created.id).toBe(flagA);
    expect(created.applicationIds).toEqual([appA, appB]);
    expect(records).toContainEqual(expect.objectContaining({level: "INFO", msg: "flag created", flag_id: flagA, key: "checkout_redesign", enabled: true}));
    expect((await request(`/feature-flags/${flagA}`)).status).toBe(200);
    expect(await responseJson<FeatureFlag[]>(await request("/feature-flags?q=REDESIGN"))).toEqual([created]);
    expect(await responseJson<FeatureFlag[]>(await request("/feature-flags?applicationId=" + appB))).toEqual([created]);
    expect(records).toContainEqual(expect.objectContaining({level: "DEBUG", msg: "flags listed", count: 1, application_id: appB}));
    const noMatches = await request("/feature-flags?search=missing");
    expect(noMatches.status).toBe(200);
    expect(await responseJson<FeatureFlag[]>(noMatches)).toEqual([]);
    expect((await request("/feature-flags/one/two")).status).toBe(404);

    const patched = await request(`/feature-flags/${flagA}`, body({enabled: false}, "PATCH"));
    expect((await responseJson<FeatureFlag>(patched)).enabled).toBe(false);
    expect(records).toContainEqual(expect.objectContaining({msg: "flag updated", flag_id: flagA, enabled: false, fields: ["enabled"]}));
    const replaced = await request(`/feature-flags/${flagA}`, body({...flagInput([appA]), key: "checkout_v2"}, "PUT"));
    expect((await responseJson<FeatureFlag>(replaced)).key).toBe("checkout_v2");
    expect((await request(`/feature-flags/${flagA}`, body({}, "PATCH"))).status).toBe(400);
    expect((await request(`/feature-flags/${flagA}`, body({}))).status).toBe(405);
    await request("/feature-flags", body({...flagInput(), key: "other_flag"}));
    expect((await request(`/feature-flags/${flagA}`, body({...flagInput(), key: "other_flag"}, "PUT"))).status).toBe(409);
    expect(records).toContainEqual(expect.objectContaining({level: "WARN", status: 409, error: "Flag key already exists"}));
    expect((await request("/feature-flags", body({...flagInput(["missing"]), key: "missing_app"}))).status).toBe(404);
    expect((await request("/feature-flags/missing")).status).toBe(404);
    expect((await request(`/feature-flags/${flagA}`, {method: "DELETE"})).status).toBe(204);
    expect(records).toContainEqual(expect.objectContaining({msg: "flag deleted", flag_id: flagA}));
    expect((await request(`/feature-flags/${flagA}`, {method: "DELETE"})).status).toBe(404);

    const legacy = await request("/api/v1/flags", body({...flagInput([appA]), key: "legacy_flag"}));
    expect(legacy.status).toBe(201);
    const legacyFlag = await responseJson<FeatureFlag>(legacy);
    const legacyList = await request(`/api/v1/flags/${appA}`);
    expect(legacyList.status).toBe(200);
    expect(await responseJson<FeatureFlag[]>(legacyList)).toContainEqual(legacyFlag);
    expect(records).toContainEqual(expect.objectContaining({msg: "flags listed", application_id: appA, legacy: true}));
    expect(await responseJson<FeatureFlag>(await request(`/api/v1/flags/${legacyFlag.id}`))).toEqual(legacyFlag);
    expect((await request("/api/v1/flags/no-such-app")).status).toBe(404);
    expect((await request("/api/v1/flags", {method: "PATCH"})).status).toBe(405);
  });

  it("returns safe errors for malformed requests, unknown routes, and database failures", async () => {
    start();
    const unknown = await request("/unknown");
    expect(unknown.status).toBe(404);
    expect(await responseJson<{error: string}>(unknown)).toEqual({error: "Not found"});
    expect((await request("/constructor")).status).toBe(404);
    expect((await request("/applications", {method: "POST", body: "not-json"})).status).toBe(400);
    expect(records).toContainEqual(expect.objectContaining({level: "WARN", method: "POST", status: 400, error: "Request body must contain valid JSON"}));
    expect((await handleRequest(new Request("http://localhost/applications/%E0%A4%A"), database, logger)).status).toBe(400);
    expect((await request("/applications/too/many")).status).toBe(404);

    const failing = makeLogger();
    const broken = new FlagsDatabase(":memory:", {logger: failing.logger});
    broken.close();
    const failure = await handleRequest(new Request("http://localhost/applications"), broken, failing.logger);
    expect(failure.status).toBe(500);
    expect(await responseJson<{error: string}>(failure)).toEqual({error: "Internal server error"});
    expect(failing.records.map((record) => record.msg)).toEqual(["database opened", "database closed", "request completed"]);
    expect(failing.records.at(-1)).toMatchObject({
      level: "ERROR", status: 500, error: {message: expect.any(String), stack: expect.any(String)},
    });
  });
});
