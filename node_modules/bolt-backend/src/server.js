import { WebSocketServer } from "ws";
import { SerialPort } from "serialport";
import { config } from "./config.js";
import { mapValuesToTelemetry, TELEMETRY_FIELDS } from "./payload-schema.js";
import { TelemetrySource } from "./serial-source.js";
import { inspectTelemetryPayload } from "./telemetry-parser.js";
import { TelemetryLogger } from "./logger.js";
import fs from "node:fs/promises";
import path from "node:path";

let source = new TelemetrySource(config);
let currentComPort = config.comPort;
const logger = new TelemetryLogger(config.logDir, TELEMETRY_FIELDS);
const wss = new WebSocketServer({ port: config.wsPort });

// Replay state
let replayRows = [];
let replayTimer = null;
let replayIndex = 0;
let replayIntervalMs = 100; // default 10Hz

const resolveReplayFile = async (fileName) => {
  const logDir = config.logDir || "./logs";
  let targetFile = fileName;

  if (!targetFile) {
    const files = await fs.readdir(logDir);
    const candidates = files.filter((n) => n.startsWith("telemetry_") && n.endsWith(".log"));
    if (candidates.length === 0) {
      throw new Error("no log files found");
    }
    candidates.sort().reverse();
    targetFile = candidates[0];
  }

  const filePath = path.join(config.logDir, targetFile);
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("log file has no data rows");
  }

  const header = lines[0].split(",").map((s) => s.trim());
  const schema = header.slice(2);

  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",");
    const timestamp = Number(cols[0]) || Date.now();
    const isoTime = cols[1] || new Date(timestamp).toISOString();
    const values = cols.slice(2).map((v) => {
      const n = Number(v.replace(/"/g, ""));
      return Number.isFinite(n) ? n : null;
    });
    return { timestamp, isoTime, values };
  });

  return { targetFile, rows, schema };
};

const stopReplay = () => {
  if (replayTimer) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  replayRows = [];
  replayIndex = 0;
  broadcast({ type: "replay_state", active: false, timestamp: Date.now() });
};

const startReplay = async (fileName) => {
  try {
    stopReplay();

    const { targetFile, rows, schema } = await resolveReplayFile(fileName);

    replayRows = rows.map((row) => ({ ...row, schema }));

    replayIndex = 0;
    broadcast({ type: "replay_state", active: true, fileName: targetFile, total: replayRows.length, timestamp: Date.now() });

    replayTimer = setInterval(() => {
      if (replayIndex >= replayRows.length) {
        stopReplay();
        return;
      }
      const row = replayRows[replayIndex++];
      const channels = mapValuesToTelemetry(row.values);
      broadcast({
        type: "telemetry",
        rawHex: null,
        values: row.values,
        channels,
        schema: row.schema,
        timestamp: row.timestamp || Date.now()
      });
    }, replayIntervalMs);

    return { fileName: targetFile, total: replayRows.length };
  } catch (error) {
    stopReplay();
    throw error;
  }
};

const loadReplay = async (fileName) => {
  const { targetFile, rows, schema } = await resolveReplayFile(fileName);
  return {
    fileName: targetFile,
    schema,
    rows,
    total: rows.length
  };
};

wss.on("connection", (socket) => {
  socket.send(JSON.stringify({ type: "status", message: "Connected to BOLT backend" }));
  socket.send(
    JSON.stringify({
      type: "telemetry_schema",
      schema: TELEMETRY_FIELDS,
      timestamp: Date.now()
    })
  );
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

    if (message?.type === "list_logs") {
      try {
        const logDir = config.logDir || "./logs";
        const files = await fs.readdir(logDir);
        const candidates = files
          .filter((n) => n.startsWith("telemetry_") && (n.endsWith(".log") || n.endsWith(".csv")))
          .sort()
          .reverse();

        const details = await Promise.all(
          candidates.map(async (fname) => {
            try {
              const stat = await fs.stat(path.join(logDir, fname));
              return { name: fname, size: stat.size, mtime: stat.mtimeMs };
            } catch {
              return { name: fname };
            }
          })
        );

        socket.send(
          JSON.stringify({ type: "logs_list", files: details, timestamp: Date.now() })
        );
      } catch (error) {
        socket.send(
          JSON.stringify({ type: "com_error", message: `Failed to list logs: ${error.message}`, timestamp: Date.now() })
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

    if (message?.type === "load_replay") {
      try {
        const info = await loadReplay(message.fileName);
        socket.send(
          JSON.stringify({
            type: "replay_loaded",
            fileName: info.fileName,
            schema: info.schema,
            rows: info.rows,
            total: info.total,
            timestamp: Date.now()
          })
        );
      } catch (error) {
        socket.send(
          JSON.stringify({
            type: "com_error",
            message: `Failed to load replay: ${error.message}`,
            timestamp: Date.now()
          })
        );
      }
      return;
    }

    if (message?.type === "start_replay") {
      try {
        const info = await startReplay(message.fileName);
        socket.send(JSON.stringify({ type: "replay_state", active: true, fileName: info.fileName, total: info.total, timestamp: Date.now() }));
      } catch (error) {
        socket.send(JSON.stringify({ type: "com_error", message: `Failed to start replay: ${error.message}`, timestamp: Date.now() }));
      }
      return;
    }

    if (message?.type === "stop_replay") {
      try {
        stopReplay();
        socket.send(JSON.stringify({ type: "replay_state", active: false, timestamp: Date.now() }));
      } catch (error) {
        socket.send(JSON.stringify({ type: "com_error", message: `Failed to stop replay: ${error.message}`, timestamp: Date.now() }));
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
  stopReplay();
  wss.close(() => process.exit(0));
});

console.log(`[WS] Listening on ws://localhost:${config.wsPort}`);
source.start();
