import { EventEmitter } from "node:events";
import { SerialPort, ReadlineParser } from "serialport";
import { TELEMETRY_WORD_COUNT } from "./payload-schema.js";

const toSignedInt16Hex = (value) => {
  const clamped = Math.max(-32768, Math.min(32767, Math.trunc(value)));
  const asUnsigned = clamped < 0 ? 0x10000 + clamped : clamped;
  return asUnsigned.toString(16).toUpperCase().padStart(4, "0");
};

const buildMockPayload = (cursor, wordCount) => {
  const words = [];

  for (let index = 0; index < wordCount; index += 1) {
    let value;

    if (index === 0) {
      value = cursor;
    } else if (index % 5 === 0) {
      value = -200 + ((cursor + index) % 40);
    } else {
      value = 800 + (index * 13) + ((cursor * 3) % 90);
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
