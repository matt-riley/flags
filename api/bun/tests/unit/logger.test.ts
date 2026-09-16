import {describe, expect, it, spyOn} from "bun:test";
import {Logger} from "../../src/logging/logger";
import {makeLogger} from "../helpers";

describe("structured logger", () => {
  it("writes slog-style JSON records filtered by level, with child attributes", () => {
    const {logger, records} = makeLogger("info");
    logger.debug("hidden");
    logger.info("visible", {count: 2});
    logger.with({request_id: "r1", user: "u"}).with({request_id: "r2"}).warn("child", {extra: true});
    logger.error("boom", {error: new TypeError("bad")});

    expect(records).toHaveLength(3);
    expect(records[0]).toEqual({time: expect.any(String), level: "INFO", msg: "visible", count: 2});
    expect(records[1]).toEqual({time: expect.any(String), level: "WARN", msg: "child", request_id: "r2", user: "u", extra: true});
    expect(records[2]).toMatchObject({level: "ERROR", msg: "boom", error: {name: "TypeError", message: "bad", stack: expect.stringContaining("TypeError: bad")}});
  });

  it("writes nothing at the off level", () => {
    const {logger, records} = makeLogger("off");
    logger.error("ignored");
    expect(records).toEqual([]);
  });

  it("reads the level from the environment and warns about unknown values", () => {
    const lines: string[] = [];
    const sink = (line: string) => void lines.push(line);

    const debug = Logger.fromEnvironment("DEBUG", sink);
    expect(debug.level).toBe("debug");
    const fallback = Logger.fromEnvironment("constructor", sink);
    expect(fallback.level).toBe("info");
    expect(lines.map((line) => JSON.parse(line))).toEqual([
      {time: expect.any(String), level: "WARN", msg: "unknown LOG_LEVEL, defaulting to info", value: "constructor"},
    ]);
  });

  it("writes newline-terminated records to stdout by default", () => {
    const write = spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      new Logger().info("hello");
      expect(write).toHaveBeenCalledWith(expect.stringMatching(/"msg":"hello".*\n$/));
    } finally {
      write.mockRestore();
    }
  });
});
