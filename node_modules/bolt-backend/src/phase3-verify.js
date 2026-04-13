import { spawn } from "node:child_process";
import { WebSocket } from "ws";
import { config } from "./config.js";

const VERIFY_DURATION_MS = 2500;
const SERVER_BOOT_GRACE_MS = 500;
const MIN_TELEMETRY_MESSAGES = 5;

const connectClient = (url, label) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(url);

    const state = {
      label,
      telemetryCount: 0,
      statusCount: 0,
      parseErrors: 0,
      invalidTelemetry: 0,
      connected: false
    };

    socket.once("open", () => {
      state.connected = true;
      resolve({ socket, state });
    });

    socket.on("message", (rawMessage) => {
      try {
        const message = JSON.parse(String(rawMessage));

        if (message.type === "status") {
          state.statusCount += 1;
          return;
        }

        if (message.type === "telemetry") {
          const hasHex = typeof message.rawHex === "string" && message.rawHex.length > 0;
          const hasValues =
            Array.isArray(message.values) && message.values.length === config.telemetryWords;
          const hasTimestamp = Number.isFinite(message.timestamp);

          if (!hasHex || !hasValues || !hasTimestamp) {
            state.invalidTelemetry += 1;
            return;
          }

          state.telemetryCount += 1;
        }
      } catch {
        state.parseErrors += 1;
      }
    });

    socket.once("error", (error) => {
      reject(new Error(`${label} failed to connect: ${error.message}`));
    });
  });

const summarize = (states) => {
  for (const state of states) {
    console.log(
      `[PHASE3] ${state.label} connected=${state.connected} status=${state.statusCount} telemetry=${state.telemetryCount} parseErrors=${state.parseErrors} invalidTelemetry=${state.invalidTelemetry}`
    );
  }
};

const closeSocket = (socket) =>
  new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }

    socket.once("close", () => resolve());
    socket.close();
  });

const terminateServer = (serverProcess) =>
  new Promise((resolve) => {
    if (serverProcess.exitCode !== null) {
      resolve();
      return;
    }

    serverProcess.once("exit", () => resolve());
    serverProcess.kill("SIGINT");
  });

const run = async () => {
  const wsUrl = `ws://localhost:${config.wsPort}`;

  const serverProcess = spawn(process.execPath, ["src/server.js"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      MOCK_SERIAL: "true",
      TELEMETRY_WORDS: String(config.telemetryWords),
      WS_PORT: String(config.wsPort)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  serverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[SERVER] ${chunk}`);
  });

  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[SERVER] ${chunk}`);
  });

  await new Promise((resolve) => setTimeout(resolve, SERVER_BOOT_GRACE_MS));

  const clientA = await connectClient(wsUrl, "client-A");
  const clientB = await connectClient(wsUrl, "client-B");

  await new Promise((resolve) => setTimeout(resolve, VERIFY_DURATION_MS));

  const states = [clientA.state, clientB.state];
  summarize(states);

  const failed = states.some(
    (state) =>
      !state.connected ||
      state.telemetryCount < MIN_TELEMETRY_MESSAGES ||
      state.parseErrors > 0 ||
      state.invalidTelemetry > 0
  );

  await Promise.all([closeSocket(clientA.socket), closeSocket(clientB.socket)]);
  await terminateServer(serverProcess);

  if (failed) {
    throw new Error("Phase 3 verification failed: one or more clients did not receive valid telemetry broadcast");
  }

  console.log("[PHASE3] PASS: WebSocket router broadcasts valid telemetry to multiple local clients.");
};

run().catch((error) => {
  console.error(`[PHASE3] FAIL: ${error.message}`);
  process.exit(1);
});
