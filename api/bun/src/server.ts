import {Logger} from "./logging/logger";
import {FlagsDatabase} from "./persistence/flags-database";
import {handleRequest} from "./http/router";

export type ServerOptions = {database?: FlagsDatabase; port?: number; logger?: Logger};

export function createServer(options: ServerOptions = {}) {
  const logger = options.logger ?? Logger.fromEnvironment();
  const database = options.database ?? new FlagsDatabase(Bun.env.FLAGS_DB_PATH ?? "./flags.sqlite", {logger});
  const server = Bun.serve({
    port: options.port ?? Bun.env.PORT ?? 3000,
    fetch: (request) => handleRequest(request, database, logger),
  });
  logger.info("server listening", {url: server.url.href});
  return server;
}
