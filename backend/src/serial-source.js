import { EventEmitter } from "node:events";
import { SerialPort, ReadlineParser } from "serialport";
import { TELEMETRY_WORD_COUNT, TELEMETRY_FIELDS } from "./payload-schema.js";

const toSignedInt16Hex = (value) => {
  const clamped = Math.max(-32768, Math.min(32767, Math.trunc(value)));
  const asUnsigned = clamped < 0 ? 0x10000 + clamped : clamped;
  return asUnsigned.toString(16).toUpperCase().padStart(4, "0");
};

// Realistic value ranges per channel
const CHANNEL_RANGES = {
  TimeSampling: { min: 0, max: 10000 },
  bmsVolts: { min: 40, max: 55 },
  bmsTemp: { min: 20, max: 80 },
  bmsCurrent: { min: -100, max: 200 },
  bmsSOC: { min: 10, max: 100 },
  engineTemp: { min: 20, max: 120 },
  ECUBattV: { min: 12, max: 15 },
  speed: { min: 0, max: 150 },
  RPM: { min: 0, max: 13000 },
  throttle: { min: 0, max: 100 },
  steering: { min: -100, max: 100 },
  HyStatus: { min: 0, max: 1 },
  Gear: { min: 0, max: 6 },
  RawBrake: { min: 0, max: 4000 },
  imuAx: { min: -50, max: 50 },
  imuAy: { min: -50, max: 50 },
  imuAz: { min: -100, max: 100 },
  imuGx: { min: -360, max: 360 },
  imuGy: { min: -360, max: 360 },
  imuGz: { min: -360, max: 360 },
  susp1Raw: { min: 0, max: 4000 },
  susp2Raw: { min: 0, max: 4000 },
  susp3Raw: { min: 0, max: 4000 },
  susp4Raw: { min: 0, max: 4000 },
  rpmPa15: { min: 0, max: 1000 },
  rpmPb3: { min: 0, max: 1000 },
  rpmPb5: { min: 0, max: 1000 },
  rpmPb8: { min: 0, max: 1000 },
  vescRpmLeft: { min: 0, max: 5000 },
  vescRpmRight: { min: 0, max: 5000 },
  apps1: { min: 0, max: 4000 },
  apps2: { min: 0, max: 4000 },
  pedal: { min: 0, max: 100 },
  duty: { min: 0, max: 100 },
  leftMotor: { min: -500, max: 500 },
  rightMotor: { min: -500, max: 500 }
};

const buildMockPayload = (cursor, wordCount) => {
  const words = [];

  for (let index = 0; index < wordCount; index += 1) {
    let value;
    const fieldName = TELEMETRY_FIELDS[index];
    const range = CHANNEL_RANGES[fieldName] || { min: 0, max: 1000 };

    // Generate realistic values with smooth oscillation
    const sine = Math.sin((cursor + index) * 0.1) * 0.5 + 0.5; // 0 to 1
    const noise = Math.random() * 0.2 - 0.1; // -0.1 to 0.1

    if (fieldName === "TimeSampling") {
      // Timestamp increments
      value = cursor * 100;
    } else if (fieldName === "Gear") {
      // Gear cycles through values
      value = Math.floor((cursor / 20) % 7);
    } else if (fieldName === "HyStatus") {
      // Binary status
      value = cursor % 100 < 80 ? 1 : 0;
    } else {
      // Smooth oscillation between min and max
      value = range.min + (range.max - range.min) * (sine + noise * 0.5);
    }

    words.push(toSignedInt16Hex(value));
  }

  return words.join("");
};

export class TelemetrySource extends EventEmitter {
  constructor({ comPort, baudRate, mockSerial, telemetryWords }) {
    super();
    this.comPort = comPort;
    this.baudRate = baudRate;
    this.mockSerial = mockSerial;
    this.telemetryWords = Number.isInteger(telemetryWords) && telemetryWords > 0
      ? telemetryWords
      : TELEMETRY_WORD_COUNT;
    this.serialPort = null;
    this.parser = null;
    this.mockInterval = null;
    this.mockCursor = 0;
  }

  start() {
    if (this.mockSerial) {
      this.startMockStream();
      return;
    }

    this.serialPort = new SerialPort({
      path: this.comPort,
      baudRate: this.baudRate
    });

    this.parser = this.serialPort.pipe(new ReadlineParser({ delimiter: "\n" }));

    this.serialPort.on("open", () => {
      this.emit("status", `Serial opened at ${this.comPort} @ ${this.baudRate} baud`);
    });

    this.serialPort.on("error", (error) => {
      this.emit("error", error);
    });

    this.parser.on("data", (line) => {
      const payload = String(line).trim();
      if (payload.length > 0) {
        this.emit("payload", payload);
      }
    });
  }

  startMockStream() {
    this.emit("status", "MOCK_SERIAL enabled. Emitting synthetic 10Hz payloads.");
    this.mockInterval = setInterval(() => {
      const payload = buildMockPayload(this.mockCursor, this.telemetryWords);
      this.mockCursor += 1;
      this.emit("payload", payload);
    }, 100);
  }

  async stop() {
    if (this.mockInterval) {
      clearInterval(this.mockInterval);
      this.mockInterval = null;
    }

    if (this.serialPort && this.serialPort.isOpen) {
      await new Promise((resolve, reject) => {
        this.serialPort.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  }
}
