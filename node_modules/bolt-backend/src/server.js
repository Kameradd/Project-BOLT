import { WebSocketServer } from "ws";
import { SerialPort } from "serialport";
import { config } from "./config.js";
import { mapValuesToTelemetry, TELEMETRY_FIELDS } from "./payload-schema.js";
import { TelemetrySource } from "./serial-source.js";
import { inspectTelemetryPayload } from "./telemetry-parser.js";
import { TelemetryLogger } from "./logger.js";

let source = new TelemetrySource(config);
let currentComPort = config.comPort;
const logger = new TelemetryLogger(config.logDir, TELEMETRY_FIELDS);
const wss = new WebSocketServer({ port: config.wsPort });

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "status", message: "Connected to BOLT backend" }));
  socket.send(
    JSON.stringify({
      type: "com_state",
      currentComPort,
      mockSerial: config.mockSerial,
      timestamp: Date.now()
    })
  );

  // Send current logging status
  const loggerStatus = logger.getStatus();
  socket.send(
    JSON.stringify({
      type: "logger_state",
      ...loggerStatus,
      timestamp: Date.now()
    })
  );

  socket.on("message", async (rawMessage) => {
    let message;

    try {
      message = JSON.parse(String(rawMessage));
    } catch {
      socket.send(
        JSON.stringify({
          type: "com_error",
          message: "Invalid command payload",
          timestamp: Date.now()
        })
      );
      return;
    }

    if (message?.type === "list_ports") {
      try {
        const ports = await SerialPort.list();
        socket.send(
          JSON.stringify({
            type: "ports_list",
            ports: ports.map((port) => ({
              path: port.path,
              manufacturer: port.manufacturer || "",
              serialNumber: port.serialNumber || "",
              vendorId: port.vendorId || "",
              productId: port.productId || ""
            })),
            currentComPort,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "com_error",
            message: `Failed to list ports: ${error.message}`,
            timestamp: Date.now()
          })
        );
      }
      return;
    }

    if (message?.type === "switch_port") {
      const requestedPort = String(message.comPort || "").trim();
      if (!requestedPort) {
        socket.send(
          JSON.stringify({
            type: "com_error",
            message: "comPort is required",
            timestamp: Date.now()
          })
        );
        return;
      }

      try {
        await source.stop();

        source = new TelemetrySource({
          ...config,
          comPort: requestedPort
        });
        attachSourceHandlers(source);
        source.start();
        currentComPort = requestedPort;

        broadcast({
          type: "com_state",
          currentComPort,
          mockSerial: config.mockSerial,
          message: `Switched serial port to ${requestedPort}`,
          timestamp: Date.now()
        });
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "com_error",
            message: `Failed to switch port: ${error.message}`,
            timestamp: Date.now()
          })
        );
      }
      return;
    }

    if (message?.type === "toggle_logging") {
      const enable = Boolean(message.enable);
      try {
        if (enable) {
          await logger.startLogging();
        } else {
          await logger.stopLogging();
        }

        const loggerStatus = logger.getStatus();
        broadcast({
          type: "logger_state",
          ...loggerStatus,
          timestamp: Date.now()
        });
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "com_error",
            message: `Failed to toggle logging: ${error.message}`,
            timestamp: Date.now()
          })
        );
      }
      return;
    }
  });
});

const broadcast = (message) => {
  const encoded = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(encoded);
    }
  }
};

const attachSourceHandlers = (nextSource) => {
  nextSource.on("status", (message) => {
    console.log(`[STATUS] ${message}`);
    broadcast({ type: "status", message, timestamp: Date.now() });
  });

  nextSource.on("error", (error) => {
    console.error("[SERIAL ERROR]", error.message);
    broadcast({ type: "error", message: error.message, timestamp: Date.now() });
  });

  nextSource.on("payload", (payload) => {
    const inspection = inspectTelemetryPayload(payload, {
      expectedWords: config.telemetryWords,
      schema: TELEMETRY_FIELDS
    });
    if (!inspection.values) {
      if (inspection.reason === "non_telemetry_line") {
        return;
      }

      broadcast({
        type: "drop",
        reason: inspection.reason || "invalid_payload",
        payload: String(payload).slice(0, 120),
        timestamp: Date.now()
      });
      return;
    }

    if (inspection.reason) {
      broadcast({
        type: "status",
        message: `[PARSER] ${inspection.reason}`,
        timestamp: Date.now()
      });
    }

    const channels = inspection.channels || mapValuesToTelemetry(inspection.values);
    const schema =
      inspection.channels && typeof inspection.channels === "object"
        ? Object.keys(inspection.channels)
        : TELEMETRY_FIELDS;

    // Log parsed values if logging is enabled
    if (logger.isLogging) {
      logger.log(inspection.values);
    }

    broadcast({
      type: "telemetry",
      rawHex: payload,
      values: inspection.values,
      channels,
      schema,
      timestamp: Date.now()
    });
  });
};

attachSourceHandlers(source);

process.on("SIGINT", async () => {
  console.log("\nShutting down backend...");
  await source.stop();
  await logger.stopLogging();
  wss.close(() => process.exit(0));
});

console.log(`[WS] Listening on ws://localhost:${config.wsPort}`);
source.start();
