import {NotFoundError} from "../domain/errors";
import {validateApplicationInput, validateFlagInput} from "../domain/validation";
import type {Logger} from "../logging/logger";
import type {FlagsDatabase} from "../persistence/flags-database";
import {allow, empty, json} from "./response";
import {decodeId, querySearch, readJson} from "./request";

export type RequestContext = {
  request: Request;
  url: URL;
  database: FlagsDatabase;
  /** Already scoped to the current request (carries `request_id`). */
  logger: Logger;
};

function found<T>(value: T | null, message: string): T {
  if (!value) throw new NotFoundError(message);
  return value;
}

export async function handleFlagCollection({request, url, database, logger}: RequestContext): Promise<Response> {
  if (request.method === "GET") {
    const search = querySearch(url) || undefined;
    const applicationId = url.searchParams.get("applicationId") ?? undefined;
    const flags = database.listFlags({search, applicationId});
    logger.debug("flags listed", {count: flags.length, search, application_id: applicationId});
    return json(flags);
  }
  if (request.method === "POST") {
    const flag = database.createFlag(validateFlagInput(await readJson(request)));
    logger.info("flag created", {flag_id: flag.id, key: flag.key, enabled: flag.enabled});
    return json(flag, 201);
  }
  return allow("GET, POST, OPTIONS");
}

export async function handleFlagItem({request, database, logger}: RequestContext, id: string): Promise<Response> {
  const resourceId = decodeId(id);
  if (request.method === "GET") return json(found(database.getFlag(resourceId), "Flag not found"));
  if (request.method === "PUT" || request.method === "PATCH") {
    const current = found(database.getFlag(resourceId), "Flag not found");
    const input = validateFlagInput(await readJson(request), request.method === "PATCH");
    const flag = database.updateFlag(resourceId, {...current, ...input});
    logger.info("flag updated", {flag_id: flag.id, key: flag.key, enabled: flag.enabled, fields: Object.keys(input)});
    return json(flag);
  }
  if (request.method === "DELETE") {
    database.deleteFlag(resourceId);
    logger.info("flag deleted", {flag_id: resourceId});
    return empty(204);
  }
  return allow("GET, PUT, PATCH, DELETE, OPTIONS");
}

/** `/api/v1/flags/:id` historically accepted an application id on GET and listed that application's flags. */
export async function handleLegacyFlagItem(context: RequestContext, id: string): Promise<Response> {
  const {request, database, logger} = context;
  if (request.method !== "GET") return handleFlagItem(context, id);
  const resourceId = decodeId(id);
  const application = database.getApplication(resourceId);
  if (application) {
    const flags = database.listFlags({applicationId: application.id});
    logger.debug("flags listed", {count: flags.length, application_id: application.id, legacy: true});
    return json(flags);
  }
  return json(found(database.getFlag(resourceId), "Application not found"));
}

export async function handleApplicationCollection({request, url, database, logger}: RequestContext): Promise<Response> {
  if (request.method === "GET") {
    const search = querySearch(url) || undefined;
    const applications = database.listApplications(search);
    logger.debug("applications listed", {count: applications.length, search});
    return json(applications);
  }
  if (request.method === "POST") {
    const application = database.createApplication(validateApplicationInput(await readJson(request)));
    logger.info("application created", {application_id: application.id, slug: application.slug});
    return json(application, 201);
  }
  return allow("GET, POST, OPTIONS");
}

export async function handleApplicationItem({request, database, logger}: RequestContext, id: string): Promise<Response> {
  const resourceId = decodeId(id);
  if (request.method === "GET") return json(found(database.getApplication(resourceId), "Application not found"));
  if (request.method === "PUT" || request.method === "PATCH") {
    const current = found(database.getApplication(resourceId), "Application not found");
    const input = validateApplicationInput(await readJson(request), request.method === "PATCH");
    const application = database.updateApplication(resourceId, {...current, ...input});
    logger.info("application updated", {application_id: application.id, slug: application.slug, fields: Object.keys(input)});
    return json(application);
  }
  if (request.method === "DELETE") {
    database.deleteApplication(resourceId);
    logger.info("application deleted", {application_id: resourceId});
    return empty(204);
  }
  return allow("GET, PUT, PATCH, DELETE, OPTIONS");
}
