export type LogLevel = "debug" | "info" | "warn" | "error" | "off";
export type LogAttributes = Record<string, unknown>;
export type LogSink = (line: string) => void;

// Same numeric severities as Go's log/slog, so levels compare the same way.
const severities: Record<LogLevel, number> = {debug: -4, info: 0, warn: 4, error: 8, off: Infinity};

export type LoggerOptions = {
  level?: LogLevel;
  /** Receives one newline-terminated JSON record per log call. Defaults to stdout. */
  sink?: LogSink;
  attributes?: LogAttributes;
};

function writeToStdout(line: string): void {
  process.stdout.write(line);
}

function serialize(_key: string, value: unknown): unknown {
  if (value instanceof Error) return {name: value.name, message: value.message, stack: value.stack};
  return value;
}

/** Structured JSON logger modelled on log/slog: `{"time","level","msg",...attributes}` per line. */
export class Logger {
  static readonly discard = new Logger({level: "off"});

  static fromEnvironment(level = Bun.env.LOG_LEVEL, sink?: LogSink): Logger {
    const normalized = (level ?? "info").toLowerCase();
    if (Object.hasOwn(severities, normalized)) return new Logger({level: normalized as LogLevel, sink});
    const logger = new Logger({sink});
    logger.warn("unknown LOG_LEVEL, defaulting to info", {value: level});
    return logger;
  }

  readonly level: LogLevel;
  private readonly sink: LogSink;
  private readonly attributes: LogAttributes;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? "info";
    this.sink = options.sink ?? writeToStdout;
    this.attributes = options.attributes ?? {};
  }

  /** Returns a child logger that adds `attributes` to every record. */
  with(attributes: LogAttributes): Logger {
    return new Logger({level: this.level, sink: this.sink, attributes: {...this.attributes, ...attributes}});
  }

  debug(message: string, attributes?: LogAttributes): void {
    this.log("debug", message, attributes);
  }

  info(message: string, attributes?: LogAttributes): void {
    this.log("info", message, attributes);
  }

  warn(message: string, attributes?: LogAttributes): void {
    this.log("warn", message, attributes);
  }

  error(message: string, attributes?: LogAttributes): void {
    this.log("error", message, attributes);
  }

  log(level: Exclude<LogLevel, "off">, message: string, attributes: LogAttributes = {}): void {
    if (severities[level] < severities[this.level]) return;
    const record = {time: new Date().toISOString(), level: level.toUpperCase(), msg: message, ...this.attributes, ...attributes};
    this.sink(`${JSON.stringify(record, serialize)}\n`);
  }
}
