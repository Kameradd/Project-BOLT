import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { mapValuesToTelemetry, TELEMETRY_FIELDS } from "./payload-schema.js";
import { TelemetrySource } from "./serial-source.js";
import { parseHexPayload } from "./telemetry-parser.js";

const source = new TelemetrySource(config);
const wss = new WebSocketServer({ port: config.wsPort });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "status", message: "Connected to BOLT backend" }));
});

const broadcast = (message) => {
  const encoded = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(encoded);
    }
  }
};

source.on("status", (message) => {
  console.log(`[STATUS] ${message}`);
  broadcast({ type: "status", message, timestamp: Date.now() });
});

source.on("error", (error) => {
  console.error("[SERIAL ERROR]", error.message);
  broadcast({ type: "error", message: error.message, timestamp: Date.now() });
});

source.on("payload", (payload) => {
  const values = parseHexPayload(payload, config.telemetryWords);
  if (!values) {
    broadcast({ type: "drop", reason: "invalid_payload", payload, timestamp: Date.now() });
    return;
  }

    const channels = mapValuesToTelemetry(values);

  broadcast({
    type: "telemetry",
    rawHex: payload,
    values,
      channels,
      schema: TELEMETRY_FIELDS,
    timestamp: Date.now()
  });
});

process.on("SIGINT", async () => {
  console.log("\nShutting down backend...");
  await source.stop();
  wss.close(() => process.exit(0));
});

console.log(`[WS] Listening on ws://localhost:${config.wsPort}`);
source.start();
