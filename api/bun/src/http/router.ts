import type {Logger} from "../logging/logger";
import type {FlagsDatabase} from "../persistence/flags-database";
import {empty, errorResponse, json} from "./response";
import {
  type RequestContext,
  handleApplicationCollection,
  handleApplicationItem,
  handleFlagCollection,
  handleFlagItem,
  handleLegacyFlagItem,
} from "./handlers";

type Resource = {
  collection: (context: RequestContext) => Promise<Response>;
  item: (context: RequestContext, id: string) => Promise<Response>;
};

const flags: Resource = {collection: handleFlagCollection, item: handleFlagItem};
const applications: Resource = {collection: handleApplicationCollection, item: handleApplicationItem};

const resources = new Map<string, Resource>([
  ["feature-flags", flags],
  ["applications", applications],
  ["api/v1/flags", {...flags, item: handleLegacyFlagItem}],
  ["api/v1/applications", applications],
]);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-headers": "content-type, x-request-id",
  "access-control-expose-headers": "x-request-id",
};

export async function handleRequest(request: Request, database: FlagsDatabase, logger: Logger): Promise<Response> {
  const started = performance.now();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const url = new URL(request.url);
  const context: RequestContext = {request, url, database, logger: logger.with({request_id: requestId})};

  let response: Response;
  let failure: unknown;
  try {
    response = await route(context);
  } catch (error) {
    failure = error;
    response = errorResponse(error);
  }
  for (const [name, value] of Object.entries(corsHeaders)) response.headers.set(name, value);
  response.headers.set("x-request-id", requestId);

  const {status} = response;
  context.logger.log(status >= 500 ? "error" : status >= 400 ? "warn" : "info", "request completed", {
    method: request.method,
    path: url.pathname,
    status,
    duration_ms: Number((performance.now() - started).toFixed(2)),
    // Unexpected failures get the full error and stack; expected client errors only need their message.
    error: status >= 500 ? failure : (failure as Error | undefined)?.message,
  });
  return response;
}

async function route(context: RequestContext): Promise<Response> {
  const {request, url} = context;
  if (request.method === "OPTIONS") return empty(204);
  if (url.pathname === "/health") return json({status: "ok"});
  const segments = url.pathname.split("/").filter(Boolean);
  const prefixLength = segments[0] === "api" && segments[1] === "v1" ? 3 : 1;
  const resource = resources.get(segments.slice(0, prefixLength).join("/"));
  const rest = segments.slice(prefixLength);
  if (resource && rest.length === 0) return resource.collection(context);
  if (resource && rest.length === 1) return resource.item(context, rest[0]!);
  return json({error: "Not found"}, 404);
}
