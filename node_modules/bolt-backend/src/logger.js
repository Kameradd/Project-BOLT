import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs/promises";
import path from "node:path";
import { createWriteStream } from "node:fs";
import { EventEmitter } from "node:events";

const configDir = dirname(fileURLToPath(import.meta.url));

export class TelemetryLogger extends EventEmitter {
    constructor(logDir = "./logs", telemetryFields = []) {
        super();
        this.logDir = logDir;
        this.telemetryFields = telemetryFields;
        this.isLogging = false;
        this.currentStream = null;
        this.currentFileName = null;
        this.buffer = [];
        this.bufferFlushInterval = null;
    }

    async startLogging() {
        if (this.isLogging) {
            return;
        }

        try {
            // Create logs directory if it doesn't exist
            await fs.mkdir(this.logDir, { recursive: true });

            // Create filename with timestamp
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, "-").split("Z")[0];
            this.currentFileName = `telemetry_${timestamp}.log`;
            const filePath = path.join(this.logDir, this.currentFileName);

            // Create write stream with CSV header
            this.currentStream = createWriteStream(filePath, { flags: "a" });

            // Write CSV header from telemetry fields
            const headerLine = ["timestamp", "iso_time", ...this.telemetryFields].join(",");
            this.currentStream.write(headerLine + "\n");

            this.isLogging = true;
            const message = `[LOGGER] Started logging to ${this.currentFileName}`;
            console.log(message);
            this.emit("status", message);
        } catch (error) {
            const message = `[LOGGER ERROR] Failed to start logging: ${error.message}`;
            console.error(message);
            this.emit("error", new Error(message));
        }
    }

    async stopLogging() {
        if (!this.isLogging) {
            return;
        }

        try {
            // Flush remaining buffer
            await this._flushBuffer();

            // Close stream
            if (this.currentStream) {
                await new Promise((resolve) => {
                    this.currentStream.end(resolve);
                });
                this.currentStream = null;
            }

            // Clear intervals
            if (this.bufferFlushInterval) {
                clearInterval(this.bufferFlushInterval);
                this.bufferFlushInterval = null;
            }

            this.isLogging = false;
            const message = `[LOGGER] Stopped logging from ${this.currentFileName}`;
            console.log(message);
            this.emit("status", message);
        } catch (error) {
            const message = `[LOGGER ERROR] Failed to stop logging: ${error.message}`;
            console.error(message);
            this.emit("error", new Error(message));
        }
    }

    log(values) {
        if (!this.isLogging || !this.currentStream) {
            return;
        }

        try {
            const now = new Date();
            const timestamp = now.getTime();
            const isoTime = now.toISOString();

            // Create CSV row: timestamp,iso_time,value1,value2,value3...
            const valuesCsv = values
                .map((val) => {
                    if (val === null || val === undefined) {
                        return "";
                    }
                    const strVal = String(val);
                    // Escape quotes in values
                    return strVal.includes(",") || strVal.includes('"')
                        ? `"${strVal.replace(/"/g, '""')}"`
                        : strVal;
                })
                .join(",");

            const line = `${timestamp},${isoTime},${valuesCsv}`;
            this.buffer.push(line);

            // Flush buffer every 100 items or when it gets too large
            if (this.buffer.length >= 100) {
                this._flushBuffer();
            }
        } catch (error) {
            console.error(`[LOGGER ERROR] Failed to log values: ${error.message}`);
        }
    }

    async _flushBuffer() {
        if (this.buffer.length === 0 || !this.currentStream) {
            return;
        }

        return new Promise((resolve) => {
            const linesToWrite = this.buffer.splice(0);
            this.currentStream.write(linesToWrite.join("\n") + "\n", resolve);
        });
    }

    getStatus() {
        return {
            isLogging: this.isLogging,
            fileName: this.currentFileName,
            logDir: this.logDir,
            bufferSize: this.buffer.length
        };
    }
}
