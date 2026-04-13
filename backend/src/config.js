import { TELEMETRY_WORD_COUNT } from "./payload-schema.js";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  comPort: process.env.COM_PORT || "COM3",
  baudRate: toNumber(process.env.BAUD_RATE, 115200),
  wsPort: toNumber(process.env.WS_PORT, 8787),
  telemetryWords: toNumber(process.env.TELEMETRY_WORDS, TELEMETRY_WORD_COUNT),
  mockSerial: String(process.env.MOCK_SERIAL || "false").toLowerCase() === "true"
};
