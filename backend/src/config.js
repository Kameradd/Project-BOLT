import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { TELEMETRY_WORD_COUNT } from "./payload-schema.js";

const configDir = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(configDir, "../.env") });

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveTelemetryWords = () => {
  const requested = toNumber(process.env.TELEMETRY_WORDS, TELEMETRY_WORD_COUNT);
  if (!Number.isInteger(requested) || requested <= 0) {
    return TELEMETRY_WORD_COUNT;
  }

  if (requested !== TELEMETRY_WORD_COUNT) {
    console.warn(
      `[CONFIG] TELEMETRY_WORDS=${requested} mismatches schema count (${TELEMETRY_WORD_COUNT}). Using ${TELEMETRY_WORD_COUNT}.`
    );
  }

  return TELEMETRY_WORD_COUNT;
};

export const config = {
  comPort: process.env.COM_PORT || "COM3",
  baudRate: toNumber(process.env.BAUD_RATE, 115200),
  wsPort: toNumber(process.env.WS_PORT, 8787),
  telemetryWords: resolveTelemetryWords(),
  mockSerial: String(process.env.MOCK_SERIAL || "false").toLowerCase() === "true",
  logDir: process.env.LOG_DIR || "./logs",
  enableLogging: String(process.env.ENABLE_LOGGING || "false").toLowerCase() === "true"
};

