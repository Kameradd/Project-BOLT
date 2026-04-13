import { config } from "./config.js";
import { TelemetrySource } from "./serial-source.js";
import { parseHexPayload } from "./telemetry-parser.js";

const source = new TelemetrySource(config);

source.on("status", (message) => {
  console.log(`[STATUS] ${message}`);
});

source.on("error", (error) => {
  console.error("[SERIAL ERROR]", error.message);
});

source.on("payload", (payload) => {
  const values = parseHexPayload(payload, config.telemetryWords);
  if (!values) {
    console.warn(`[DROP] Invalid payload format: ${payload}`);
    return;
  }

  console.log(`[RAW] ${payload} | [PARSED] ${values.join(", ")}`);
});

process.on("SIGINT", async () => {
  console.log("\nStopping serial monitor...");
  await source.stop();
  process.exit(0);
});

source.start();
