import { TelemetrySource } from "./serial-source.js";
import { config } from "./config.js";
import { parseHexPayload } from "./telemetry-parser.js";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const VERIFY_SECONDS = toNumber(process.env.PHASE1_VERIFY_SECONDS, 3);
const expectedMinFrames = Math.max(1, Math.floor(VERIFY_SECONDS * 6));

const run = async () => {
  const source = new TelemetrySource(config);

  const stats = {
    status: 0,
    payload: 0,
    valid: 0,
    invalid: 0,
    errors: 0
  };

  source.on("status", (message) => {
    stats.status += 1;
    console.log(`[PHASE1] status: ${message}`);
  });

  source.on("error", (error) => {
    stats.errors += 1;
    console.error(`[PHASE1] serial error: ${error.message}`);
  });

  source.on("payload", (payload) => {
    stats.payload += 1;
    const values = parseHexPayload(payload, config.telemetryWords);
    if (!values) {
      stats.invalid += 1;
      return;
    }

    stats.valid += 1;
  });

  source.start();
  await new Promise((resolve) => setTimeout(resolve, VERIFY_SECONDS * 1000));
  await source.stop();

  console.log(
    `[PHASE1] Summary durationSec=${VERIFY_SECONDS} payload=${stats.payload} valid=${stats.valid} invalid=${stats.invalid} errors=${stats.errors} status=${stats.status}`
  );

  const pass = stats.errors === 0 && stats.invalid === 0 && stats.valid >= expectedMinFrames;
  if (!pass) {
    throw new Error(
      `Phase 1 verification failed: require valid>=${expectedMinFrames}, invalid=0, errors=0`
    );
  }

  console.log("[PHASE1] PASS: Serial ingestion produced valid telemetry frames.");
};

run().catch((error) => {
  console.error(`[PHASE1] FAIL: ${error.message}`);
  process.exit(1);
});
