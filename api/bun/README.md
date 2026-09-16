# Flags API

Small SQLite-backed feature flag API for the Astro admin client. Public resource IDs are UUIDs. SQLite keeps an integer internal key for relationship indexes, so the API does not pay the cost of using long UUID text keys for every join.

Install dependencies:

```bash
bun install
```

Run the API (it listens on port 3000 and uses `./flags.sqlite` by default):

```bash
bun run index.ts
```

Configuration:

| Variable        | Default           | Purpose                                                        |
|-----------------|-------------------|----------------------------------------------------------------|
| `PORT`          | `3000`            | HTTP port                                                      |
| `FLAGS_DB_PATH` | `./flags.sqlite`  | SQLite file; `:memory:` gives an ephemeral database            |
| `LOG_LEVEL`     | `info`            | `debug`, `info`, `warn`, `error`, or `off`                     |

Logs are structured JSON lines on stdout in the same shape as Go's `log/slog` JSON handler (`time`, `level`, `msg`, then attributes). Every request produces one `request completed` record with `request_id`, `method`, `path`, `status`, and `duration_ms`, logged at `INFO`, `WARN` for 4xx, or `ERROR` for 5xx (with the error and stack). Creates, updates, and deletes log their own `INFO` records carrying the same `request_id`, and list queries log at `DEBUG`. An incoming `x-request-id` header is reused, otherwise one is generated; either way it is returned in the `x-request-id` response header.

The canonical endpoints are:

```text
GET/POST                    /feature-flags
GET/PUT/PATCH/DELETE        /feature-flags/:id
GET/POST                    /applications
GET/PUT/PATCH/DELETE        /applications/:id
```

Both collection endpoints accept `q` or `search`. Flag searches cover key, name, and description; `applicationId` filters flags by application. The `/api/v1/flags` and `/api/v1/applications` paths remain available as compatibility aliases.

Run unit and HTTP integration tests:

```bash
bun test
bun run coverage
```

The coverage command is configured to fail unless every covered source file reaches 100% line and function coverage.

Project structure:

```text
src/domain/       API types, errors, and input validation
src/persistence/  SQLite schema and repository
src/http/         request helpers, responses, handlers, and routing
src/logging/      structured JSON logger
src/server.ts     Bun server composition
tests/unit/       validation, logger, and repository tests
tests/integration/ HTTP API tests
```

All runtime code now lives under `src/`; `index.ts` is the only root-level application entrypoint.
