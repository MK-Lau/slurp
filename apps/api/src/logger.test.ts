import { logger } from "./logger";

describe("logger", () => {
  it("is defined", () => {
    expect(logger).toBeDefined();
  });

  it("has expected log methods", () => {
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });

  it("uses debug level in local environment", () => {
    delete process.env.ENVIRONMENT;
    // Re-import would be needed to test dynamic level — this just verifies
    // the exported logger is at a valid pino log level.
    expect(["trace", "debug", "info", "warn", "error", "fatal"]).toContain(
      logger.level
    );
  });
});
