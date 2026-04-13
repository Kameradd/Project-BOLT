import { SerialPort } from "serialport";
import { config } from "./config.js";

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const printPortDiagnostics = async () => {
  try {
    const ports = await SerialPort.list();
    if (ports.length === 0) {
      console.error("[COM-MOCK] Diagnostic: no serial ports currently detected on this machine.");
      return;
    }

    console.error(`[COM-MOCK] Diagnostic: detected ${ports.length} serial port(s):`);
    for (const port of ports) {
      const details = [
        `path=${port.path}`,
        port.manufacturer ? `manufacturer=${port.manufacturer}` : null,
        port.serialNumber ? `serial=${port.serialNumber}` : null
      ]
        .filter(Boolean)
        .join(" ");
      console.error(`[COM-MOCK]   ${details}`);
    }
  } catch (error) {
    console.error(`[COM-MOCK] Diagnostic failed: ${error.message}`);
  }
};

const args = process.argv.slice(2);

const readArgValue = (name) => {
  const index = args.indexOf(name);
  if (index >= 0 && index + 1 < args.length) {
    return args[index + 1];
  }
  return null;
};

const hasFlag = (name) => args.includes(name);

const printHelp = () => {
  console.log("Project BOLT COM Mock Transmitter");
  console.log("Usage:");
  console.log("  npm run phase1:com-mock -w backend -- --port COM5");
  console.log("");
  console.log("Options:");
  console.log("  --port <COMx>       COM port path to write to (required unless COM_PORT env set)");
  console.log("  --baud <number>     Baud rate (default from BAUD_RATE or 115200)");
  console.log("  --hz <number>       Transmit frequency in Hz (default 10)");
  console.log("  --seconds <number>  Optional auto-stop duration (default 0 = run until Ctrl+C)");
  console.log("  --words <number>    Signed int16 words per frame (default TELEMETRY_WORDS)");
  console.log("  --help              Show this help");
};

if (hasFlag("--help") || hasFlag("-h")) {
  printHelp();
  process.exit(0);
}

const portPath = readArgValue("--port") || process.env.COM_PORT || config.comPort;
const baudRate = toNumber(readArgValue("--baud") || process.env.BAUD_RATE, config.baudRate);
const txHz = Math.max(1, toNumber(readArgValue("--hz") || process.env.MOCK_TX_HZ, 10));
const durationSeconds = Math.max(
  0,
  toNumber(readArgValue("--seconds") || process.env.MOCK_TX_SECONDS, 0)
);
const wordCount = Math.max(
  1,
  toNumber(readArgValue("--words") || process.env.TELEMETRY_WORDS, config.telemetryWords)
);

if (!portPath) {
  console.error("[COM-MOCK] Missing COM port. Provide --port COMx or COM_PORT env var.");
  process.exit(1);
}

const toSignedInt16Hex = (value) => {
  const clamped = Math.max(-32768, Math.min(32767, Math.trunc(value)));
  const asUnsigned = clamped < 0 ? 0x10000 + clamped : clamped;
  return asUnsigned.toString(16).toUpperCase().padStart(4, "0");
};

const buildPayload = (cursor) => {
  const words = [];

  for (let index = 0; index < wordCount; index += 1) {
    let value;
    if (index === 0) {
      value = cursor;
    } else if (index % 7 === 0) {
      value = -300 + ((cursor + index) % 80);
    } else {
      value = 1000 + (index * 11) + ((cursor * 5) % 120);
    }

    words.push(toSignedInt16Hex(value));
  }

  return words.join("");
};

let cursor = 0;
let sentFrames = 0;
let timer = null;
let stopTimeout = null;

const serialPort = new SerialPort({
  path: portPath,
  baudRate,
  autoOpen: false
});

const stop = async () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }

  if (stopTimeout) {
    clearTimeout(stopTimeout);
    stopTimeout = null;
  }

  if (!serialPort.isOpen) {
    console.log(`[COM-MOCK] Stopped. frames=${sentFrames}`);
    process.exit(0);
  }

  await new Promise((resolve) => {
    serialPort.drain(() => {
      serialPort.close(() => {
        resolve();
      });
    });
  });

  console.log(`[COM-MOCK] Stopped. frames=${sentFrames}`);
  process.exit(0);
};

serialPort.on("error", (error) => {
  console.error(`[COM-MOCK] Serial error: ${error.message}`);
});

serialPort.open((openError) => {
  if (openError) {
    console.error(`[COM-MOCK] Failed to open ${portPath}: ${openError.message}`);
    const lowered = String(openError.message || "").toLowerCase();

    if (lowered.includes("access denied")) {
      console.error("[COM-MOCK] Hint: COM port is locked by another app or does not allow shared access.");
      console.error(
        "[COM-MOCK] Hint: close Serial Monitor/IDE/backend readers, then retry. A single COM port cannot be opened by multiple apps simultaneously."
      );
      console.error(
        "[COM-MOCK] Hint: for TX->RX testing, use a virtual COM pair (e.g., COM5<->COM6) or dedicated loopback wiring."
      );
    }

    printPortDiagnostics().finally(() => process.exit(1));
    return;
  }

  const intervalMs = Math.max(1, Math.round(1000 / txHz));

  console.log(
    `[COM-MOCK] TX start port=${portPath} baud=${baudRate} hz=${txHz} words=${wordCount} durationSeconds=${durationSeconds}`
  );

  timer = setInterval(() => {
    const payload = buildPayload(cursor);
    cursor += 1;

    serialPort.write(`${payload}\n`, (writeError) => {
      if (writeError) {
        console.error(`[COM-MOCK] Write error: ${writeError.message}`);
        return;
      }

      sentFrames += 1;
      if (sentFrames % txHz === 0) {
        console.log(`[COM-MOCK] sent=${sentFrames} lastLen=${payload.length}`);
      }
    });
  }, intervalMs);

  if (durationSeconds > 0) {
    stopTimeout = setTimeout(() => {
      stop().catch((error) => {
        console.error(`[COM-MOCK] Stop error: ${error.message}`);
        process.exit(1);
      });
    }, durationSeconds * 1000);
  }
});

process.on("SIGINT", () => {
  stop().catch((error) => {
    console.error(`[COM-MOCK] Stop error: ${error.message}`);
    process.exit(1);
  });
});
