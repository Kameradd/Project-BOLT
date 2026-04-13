import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import { config } from "./config.js";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const SOAK_SECONDS = toNumber(process.env.SOAK_SECONDS, 60);
const BOOT_GRACE_MS = toNumber(process.env.SOAK_BOOT_GRACE_MS, 700);
const EXPECTED_HZ = 10;
const MIN_HZ_FACTOR = 0.75;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const closeSocket = (socket) =>
  new Promise((resolve) => {
    if (!socket || socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    socket.once("close", () => resolve());
    socket.close();
  });

const terminateServer = (serverProcess) =>
  new Promise((resolve) => {
    if (!serverProcess || serverProcess.exitCode !== null) {
      resolve();
      return;
    }

    serverProcess.once("exit", () => resolve());
    serverProcess.kill("SIGINT");
  });

const run = async () => {
  const wsUrl = `ws://localhost:${config.wsPort}`;
  const durationMs = Math.max(1, SOAK_SECONDS) * 1000;

  const serverProcess = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      MOCK_SERIAL: "true",
      WS_PORT: String(config.wsPort),
      TELEMETRY_WORDS: String(config.telemetryWords)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[SERVER] ${chunk}`);
  });

  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[SERVER] ${chunk}`);
  });

  await wait(BOOT_GRACE_MS);

  const socket = new WebSocket(wsUrl);

  const stats = {
    status: 0,
    telemetry: 0,
    drop: 0,
    error: 0,
    parseError: 0,
    invalidShape: 0
  };

  const startAt = Date.now();

  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", (error) => reject(new Error(`WebSocket connect failed: ${error.message}`)));
  });

  socket.on("message", (rawMessage) => {
    try {
      const message = JSON.parse(String(rawMessage));

      if (message.type === "status") {
        stats.status += 1;
        return;
      }

      if (message.type === "drop") {
        stats.drop += 1;
        return;
      }

      if (message.type === "error") {
        stats.error += 1;
        return;
      }

      if (message.type === "telemetry") {
        const valuesOk =
          Array.isArray(message.values) && message.values.length === config.telemetryWords;
        const rawOk = typeof message.rawHex === "string" && message.rawHex.length > 0;
        const tsOk = Number.isFinite(message.timestamp);

        if (!valuesOk || !rawOk || !tsOk) {
          stats.invalidShape += 1;
          return;
        }

        stats.telemetry += 1;
      }
    } catch {
      stats.parseError += 1;
    }
  });

  await wait(durationMs);

  const endAt = Date.now();
  const elapsedSec = Math.max(0.001, (endAt - startAt) / 1000);
  const telemetryHz = stats.telemetry / elapsedSec;

  await closeSocket(socket);
  await terminateServer(serverProcess);

  const minAllowedHz = EXPECTED_HZ * MIN_HZ_FACTOR;
  const pass =
    stats.error === 0 &&
    stats.drop === 0 &&
    stats.parseError === 0 &&
    stats.invalidShape === 0 &&
    telemetryHz >= minAllowedHz;

  console.log("[SOAK] Summary");
  console.log(
    `[SOAK] durationSec=${elapsedSec.toFixed(2)} telemetry=${stats.telemetry} telemetryHz=${telemetryHz.toFixed(2)} status=${stats.status} drop=${stats.drop} error=${stats.error} parseError=${stats.parseError} invalidShape=${stats.invalidShape}`
  );
  console.log(
    `[SOAK] threshold minTelemetryHz=${minAllowedHz.toFixed(2)} expectedHz=${EXPECTED_HZ.toFixed(2)}`
  );

  if (!pass) {
    throw new Error("Soak verification failed: counters or throughput below threshold");
  }

  console.log("[SOAK] PASS: Router sustained telemetry flow without drop/error/parsing faults.");
};

run().catch((error) => {
  console.error(`[SOAK] FAIL: ${error.message}`);
  process.exit(1);
});
