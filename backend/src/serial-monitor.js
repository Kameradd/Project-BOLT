import { config } from "./config.js";
import { TelemetrySource } from "./serial-source.js";
import { inspectTelemetryPayload } from "./telemetry-parser.js";

const source = new TelemetrySource(config);

source.on("status", (message) => {
  console.log(`[STATUS] ${message}`);
});

source.on("error", (error) => {
  console.error("[SERIAL ERROR]", error.message);
});

source.on("payload", (payload) => {
  const inspection = inspectTelemetryPayload(payload, {
    expectedWords: config.telemetryWords,
    schema: []
  });
  if (!inspection.values) {
    console.warn(`[DROP] ${inspection.reason || "invalid_payload"}: ${payload}`);
    return;
  }

  console.log(`[RAW/${inspection.format}] ${payload} | [PARSED] ${inspection.values.join(", ")}`);
});

process.on("SIGINT", async () => {
  console.log("\nStopping serial monitor...");
  await source.stop();
  process.exit(0);
});

source.start();
