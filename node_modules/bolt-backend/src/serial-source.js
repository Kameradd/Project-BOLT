import { EventEmitter } from "node:events";
import { SerialPort, ReadlineParser } from "serialport";
import { TELEMETRY_WORD_COUNT, TELEMETRY_FIELDS } from "./payload-schema.js";

const toSignedInt16Hex = (value) => {
  const clamped = Math.max(-32768, Math.min(32767, Math.trunc(value)));
  const asUnsigned = clamped < 0 ? 0x10000 + clamped : clamped;
  return asUnsigned.toString(16).toUpperCase().padStart(4, "0");
};

// Raw value ranges per channel (matching ESP32 encoding with scaling factors)
// These are the VALUES SENT OVER SERIAL (before decoding/division)
const CHANNEL_RANGES = {
  TimeSampling: { min: 0, max: 65535 },    // milliseconds
  bmsVolts: { min: 7200, max: 8401 },      // 720.0V - 840.1V (÷10)
  bmsTemp: { min: 30, max: 56 },           // 30°C - 56°C
  bmsCurrent: { min: 0, max: 500 },        // 0A - 50.0A (÷10)
  bmsSOC: { min: 0, max: 1000 },           // 0% - 100% (÷10)
  engineTemp: { min: 70, max: 101 },       // 70°C - 101°C
  ECUBattV: { min: 120, max: 145 },        // 12.0V - 14.5V (÷10)
  speed: { min: 0, max: 120 },             // 0 - 120 km/h
  RPM: { min: 0, max: 12000 },             // 0 - 12000 RPM
  throttle: { min: 0, max: 100 },          // 0% - 100%
  steering: { min: -450, max: 451 },       // -45.0° - 45.1° (÷10)
  HyStatus: { min: 0, max: 1 },            // binary
  Gear: { min: 0, max: 6 },                // gear number
  RawBrake: { min: 0, max: 1024 },         // 10-bit ADC
  imuAx: { min: -14715, max: 14715 },      // ±14.715 m/s² (÷1000)
  imuAy: { min: -14715, max: 14715 },      // ±14.715 m/s² (÷1000)
  imuAz: { min: -14715, max: 14715 },      // ±14.715 m/s² (÷1000)
  imuGx: { min: -360, max: 360 },          // ±360 DPS
  imuGy: { min: -360, max: 360 },          // ±360 DPS
  imuGz: { min: -500, max: 500 },          // ±50 DPS (÷10)
  susp1Raw: { min: 0, max: 4000 },         // 0 - 4000
  susp2Raw: { min: 0, max: 4000 },         // 0 - 4000
  susp3Raw: { min: 0, max: 4000 },         // 0 - 4000
  susp4Raw: { min: 0, max: 4000 },         // 0 - 4000
  rpmPa15: { min: 0, max: 1000 },          // 0 - 1000 RPM
  rpmPb3: { min: 0, max: 1000 },           // 0 - 1000 RPM
  rpmPb5: { min: 0, max: 1000 },           // 0 - 1000 RPM
  rpmPb8: { min: 0, max: 1000 },           // 0 - 1000 RPM
  vescRpmLeft: { min: 0, max: 5000 },      // 0 - 5000 RPM
  vescRpmRight: { min: 0, max: 5000 },     // 0 - 5000 RPM
  apps1: { min: 0, max: 4000 },            // 0 - 4000 ADC
  apps2: { min: 0, max: 4000 },            // 0 - 4000 ADC
  pedal: { min: 0, max: 100 },             // 0% - 100%
  duty: { min: 0, max: 100 },              // 0% - 100%
  leftMotor: { min: -500, max: 500 },      // ±500
  rightMotor: { min: -500, max: 500 }      // ±500
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
