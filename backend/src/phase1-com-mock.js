import { SerialPort } from "serialport";
import { config } from "./config.js";
import { TELEMETRY_FIELDS } from "./payload-schema.js";

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
  console.log("  --profile <name>    Signal profile: legacy|smooth|race|step (default smooth)");
  console.log("  --wave <name>       Signal form: sine|triangle|square|saw (default sine)");
  console.log("  --noise <number>    Random noise amplitude (default 12)");
  console.log("  --drift <number>    Random walk step amplitude per frame (default 1.5)");
  console.log("  --spike-rate <0-1>  Probability of transient spikes per field (default 0.002)");
  console.log("  --dropout-rate <0-1>Probability of dropped frame (default 0)");
  console.log("  --seed <number>     RNG seed for repeatable runs (default current time)");
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
const profile = String(
  readArgValue("--profile") || process.env.MOCK_TX_PROFILE || "smooth"
).toLowerCase();
const wave = String(readArgValue("--wave") || process.env.MOCK_TX_WAVE || "sine").toLowerCase();
const noiseAmplitude = Math.max(
  0,
  toNumber(readArgValue("--noise") || process.env.MOCK_TX_NOISE, 12)
);
const driftAmplitude = Math.max(
  0,
  toNumber(readArgValue("--drift") || process.env.MOCK_TX_DRIFT, 1.5)
);
const spikeRate = Math.min(
  1,
  Math.max(0, toNumber(readArgValue("--spike-rate") || process.env.MOCK_TX_SPIKE_RATE, 0.002))
);
const dropoutRate = Math.min(
  1,
  Math.max(0, toNumber(readArgValue("--dropout-rate") || process.env.MOCK_TX_DROPOUT_RATE, 0))
);
const seedValue = Math.max(
  1,
  Math.floor(toNumber(readArgValue("--seed") || process.env.MOCK_TX_SEED, Date.now()))
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

const profilePresets = {
  legacy: {
    throttleBias: 0.48,
    throttleAmp: 0.3,
    brakeBias: 0.1,
    brakeAmp: 0.2,
    speedAmp: 55,
    rpmAmp: 2800
  },
  smooth: {
    throttleBias: 0.45,
    throttleAmp: 0.28,
    brakeBias: 0.08,
    brakeAmp: 0.12,
    speedAmp: 65,
    rpmAmp: 3600
  },
  race: {
    throttleBias: 0.62,
    throttleAmp: 0.34,
    brakeBias: 0.14,
    brakeAmp: 0.22,
    speedAmp: 85,
    rpmAmp: 5200
  },
  step: {
    throttleBias: 0.35,
    throttleAmp: 0.5,
    brakeBias: 0.06,
    brakeAmp: 0.16,
    speedAmp: 70,
    rpmAmp: 4200
  }
};

const waveformValue = (phase, waveformName) => {
  const twoPi = Math.PI * 2;
  const normalized = ((phase % twoPi) + twoPi) % twoPi;
  const fraction = normalized / twoPi;

  if (waveformName === "triangle") {
    return 1 - 4 * Math.abs(Math.round(fraction - 0.25) - (fraction - 0.25));
  }

  if (waveformName === "square") {
    return fraction < 0.5 ? 1 : -1;
  }

  if (waveformName === "saw") {
    return (2 * fraction) - 1;
  }

  return Math.sin(phase);
};

let randState = seedValue >>> 0;
const random01 = () => {
  randState = (1664525 * randState + 1013904223) >>> 0;
  return randState / 4294967296;
};

const randomSigned = () => (random01() * 2) - 1;

const driftByField = new Map();
const getDrift = (field) => {
  const current = driftByField.get(field) || 0;
  const next = (current * 0.97) + (randomSigned() * driftAmplitude);
  driftByField.set(field, next);
  return next;
};

const maybeSpike = (value) => {
  if (spikeRate <= 0 || random01() >= spikeRate) {
    return value;
  }

  const spike = (300 + random01() * 2400) * (random01() > 0.5 ? 1 : -1);
  return value + spike;
};

const bounded = (value, min, max) => Math.max(min, Math.min(max, value));

const profileConfig = profilePresets[profile] || profilePresets.smooth;

const buildLegacyPayload = (cursor) => {
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

const buildRealisticPayload = (cursor) => {
  const timeSeconds = cursor / txHz;
  const basePhase = timeSeconds * Math.PI * 2;
  const speedPhase = basePhase * 0.09;
  const throttleWave = waveformValue(basePhase * 0.16, wave);
  const brakeWave = waveformValue(basePhase * 0.08 + 1.4, "triangle");

  const throttleNorm = bounded(
    profileConfig.throttleBias + (profileConfig.throttleAmp * throttleWave),
    0,
    1
  );

  const brakeNorm = bounded(
    profileConfig.brakeBias + (profileConfig.brakeAmp * ((brakeWave + 1) / 2)),
    0,
    0.95
  );

  const speedKph = bounded(
    22 + throttleNorm * profileConfig.speedAmp - brakeNorm * 22 + (waveformValue(speedPhase, "sine") * 4),
    0,
    130
  );

  const ecuRpm = bounded(
    1300 + throttleNorm * profileConfig.rpmAmp - brakeNorm * 700 + (waveformValue(basePhase * 0.31, "sine") * 200),
    900,
    9800
  );

  const gear = bounded(Math.floor((speedKph / 22) + 1), 1, 6);
  const appsBase = bounded(Math.round(throttleNorm * 1000), 0, 1000);
  const brakeBase = bounded(Math.round(brakeNorm * 1000), 0, 1000);

  const fieldValues = {
    Timestamp: cursor,
    SystemOK: 1,
    DataValidity: 1,
    CAN2RxCount: cursor * 6,
    BMS_V: 540 + waveformValue(basePhase * 0.03, "sine") * 5,
    BMS_A: -18 + (throttleNorm * 90) - (brakeNorm * 50) + waveformValue(basePhase * 0.4, "sine") * 3,
    BMS_SOC: bounded(840 - (timeSeconds * 0.02), 600, 860),
    BMS_RemCap: bounded(3200 - (timeSeconds * 0.18), 1800, 3400),
    BMS_Temp_Max: 34 + waveformValue(basePhase * 0.02, "sine") * 3,
    ECU_Temp: 70 + waveformValue(basePhase * 0.015, "sine") * 7,
    ECU_V: 132 + waveformValue(basePhase * 0.06, "sine") * 2,
    ECU_RPM: ecuRpm,
    Gear: gear,
    Throttle: Math.round(throttleNorm * 100),
    GPS_Speed: Math.round(speedKph),
    Brake_Raw: brakeBase,
    Susp1_Raw: 1600 + waveformValue(basePhase * 1.5, "sine") * 45,
    Susp2_Raw: 1610 + waveformValue(basePhase * 1.5 + 0.2, "sine") * 48,
    Susp3_Raw: 1590 + waveformValue(basePhase * 1.5 + 0.35, "sine") * 43,
    Susp4_Raw: 1605 + waveformValue(basePhase * 1.5 + 0.5, "sine") * 50,
    IMU_Ax: waveformValue(basePhase * 1.9, wave) * 110,
    IMU_Ay: waveformValue(basePhase * 1.8 + 1.1, wave) * 95,
    IMU_Az: 980 + waveformValue(basePhase * 1.2 + 0.5, "sine") * 35,
    IMU_Gx: waveformValue(basePhase * 1.1 + 0.4, wave) * 280,
    IMU_Gy: waveformValue(basePhase * 1.2 + 1.3, wave) * 260,
    IMU_Gz: waveformValue(basePhase * 1.0 + 2.1, wave) * 200,
    Steer_Raw: 1500 + waveformValue(basePhase * 0.22, "triangle") * 350,
    Steer_Norm: waveformValue(basePhase * 0.22, "triangle") * 1000,
    RPM_PA15: ecuRpm + waveformValue(basePhase * 0.33, "sine") * 70,
    RPM_PB3: ecuRpm + waveformValue(basePhase * 0.31 + 0.2, "sine") * 65,
    RPM_PB5: ecuRpm + waveformValue(basePhase * 0.29 + 0.4, "sine") * 75,
    RPM_PB8: ecuRpm + waveformValue(basePhase * 0.35 + 0.6, "sine") * 60,
    VESC_L: 1800 + throttleNorm * 2200 + waveformValue(basePhase * 0.36, "sine") * 120,
    VESC_R: 1750 + throttleNorm * 2200 + waveformValue(basePhase * 0.34 + 0.3, "sine") * 120,
    APPS1: appsBase,
    APPS2: bounded(appsBase + waveformValue(basePhase * 0.7 + 1, "sine") * 10, 0, 1000),
    Pedal: appsBase,
    Duty: bounded(Math.round(throttleNorm * 1000), 0, 1000),
    Motor_L: ecuRpm * (0.18 + throttleNorm * 0.24),
    Motor_R: ecuRpm * (0.17 + throttleNorm * 0.25)
  };

  const words = [];
  for (let index = 0; index < wordCount; index += 1) {
    const field = TELEMETRY_FIELDS[index];
    let value;

    if (field) {
      value = Number(fieldValues[field] ?? 0);
      value += getDrift(field);
      value += randomSigned() * noiseAmplitude;
      value = maybeSpike(value);
    } else {
      const synthetic = waveformValue(basePhase * (0.2 + (index * 0.01)), wave) * (700 + index * 9);
      value = synthetic + randomSigned() * noiseAmplitude;
    }

    words.push(toSignedInt16Hex(value));
  }

  return words.join("");
};

const buildPayload = (cursor) =>
  profile === "legacy" ? buildLegacyPayload(cursor) : buildRealisticPayload(cursor);

let cursor = 0;
let sentFrames = 0;
let droppedFrames = 0;
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
    console.log(`[COM-MOCK] Stopped. frames=${sentFrames} dropped=${droppedFrames}`);
    process.exit(0);
  }

  await new Promise((resolve) => {
    serialPort.drain(() => {
      serialPort.close(() => {
        resolve();
      });
    });
  });

  console.log(`[COM-MOCK] Stopped. frames=${sentFrames} dropped=${droppedFrames}`);
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
    `[COM-MOCK] TX start port=${portPath} baud=${baudRate} hz=${txHz} words=${wordCount} durationSeconds=${durationSeconds} profile=${profile} wave=${wave} noise=${noiseAmplitude} drift=${driftAmplitude} spikeRate=${spikeRate} dropoutRate=${dropoutRate} seed=${seedValue}`
  );

  timer = setInterval(() => {
    if (dropoutRate > 0 && random01() < dropoutRate) {
      droppedFrames += 1;
      cursor += 1;
      return;
    }

    const payload = buildPayload(cursor);
    cursor += 1;

    serialPort.write(`${payload}\n`, (writeError) => {
      if (writeError) {
        console.error(`[COM-MOCK] Write error: ${writeError.message}`);
        return;
      }

      sentFrames += 1;
      if (sentFrames % txHz === 0) {
        console.log(
          `[COM-MOCK] sent=${sentFrames} dropped=${droppedFrames} lastLen=${payload.length}`
        );
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
