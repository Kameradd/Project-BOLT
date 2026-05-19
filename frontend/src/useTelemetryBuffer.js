import { useEffect, useRef } from "react";

const MAX_POINTS = 600;
const WS_URL = "ws://localhost:8787";
const DEFAULT_TELEMETRY_CHANNEL = "ECU_RPM";
const RECONNECT_DELAY_MS = 1000;
const DEFAULT_CHANNEL =
  String(import.meta.env.VITE_TELEMETRY_CHANNEL || "").trim() || DEFAULT_TELEMETRY_CHANNEL;

export const useTelemetryBuffer = () => {
  const socketRef = useRef(null);
  const statusRef = useRef("disconnected");
  const availablePortsRef = useRef([]);
  const currentComPortRef = useRef("");
  const comActionStatusRef = useRef("");
  const availableChannelsRef = useRef([DEFAULT_CHANNEL]);
  const loggerStatusRef = useRef({
    isLogging: false,
    fileName: null,
    logDir: "./logs",
    bufferSize: 0
  });
  const replayStatusRef = useRef({
    active: false,
    fileName: null,
    total: 0
  });
  const logsListRef = useRef([]);
  const offlineReplayStatusRef = useRef({
    loaded: false,
    playing: false,
    fileName: null,
    total: 0,
    playhead: 0,
    startIndex: 0,
    endIndex: 0,
    windowSeconds: 10,
    schema: [],
    playbackSpeedMultiplier: 1.0,
    sampleRate: 100
  });
  const offlineReplayRowsRef = useRef([]);
  const offlineReplayTimerRef = useRef(null);
  const telemetryRef = useRef({
    x: [],
    channels: {
      [DEFAULT_CHANNEL]: []
    }
  });

  const resetTelemetryBuffer = () => {
    const seedChannels =
      Array.isArray(availableChannelsRef.current) && availableChannelsRef.current.length > 0
        ? availableChannelsRef.current
        : [DEFAULT_CHANNEL];

    telemetryRef.current = {
      x: [],
      channels: Object.fromEntries(seedChannels.map((channel) => [channel, []]))
    };
  };

  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const buildOfflineWindow = () => {
    const state = offlineReplayStatusRef.current;
    const rows = offlineReplayRowsRef.current;
    const schema = Array.isArray(state.schema) ? state.schema : [];

    if (!state.loaded || rows.length === 0 || schema.length === 0) {
      return null;
    }

    const playhead = clamp(state.playhead, 0, rows.length - 1);
    const endRow = rows[playhead];
    if (!endRow || !Number.isFinite(endRow.timestamp)) {
      return null;
    }

    const windowMs = Math.max(1, Number(state.windowSeconds) || 10) * 1000;
    const cutoff = endRow.timestamp - windowMs;
    let startIndex = playhead;

    while (startIndex > 0 && Number.isFinite(rows[startIndex - 1]?.timestamp) && rows[startIndex - 1].timestamp >= cutoff) {
      startIndex -= 1;
    }

    const windowRows = rows.slice(startIndex, playhead + 1);
    const channels = Object.fromEntries(schema.map((channel) => [channel, []]));
    const x = [];

    for (const row of windowRows) {
      x.push(row.timestamp / 1000);
      schema.forEach((channel, index) => {
        const value = Array.isArray(row.values) && Number.isFinite(row.values[index]) ? row.values[index] : 0;
        channels[channel].push(value);
      });
    }

    return {
      x,
      channels,
      startIndex,
      endIndex: playhead,
      startTimestamp: x[0] ?? null,
      endTimestamp: x[x.length - 1] ?? null
    };
  };

  const applyOfflineWindow = () => {
    const windowData = buildOfflineWindow();
    if (!windowData) {
      return;
    }

    telemetryRef.current = {
      x: windowData.x,
      channels: windowData.channels
    };

    offlineReplayStatusRef.current = {
      ...offlineReplayStatusRef.current,
      startIndex: windowData.startIndex,
      endIndex: windowData.endIndex
    };
  };

  const stopOfflineTimer = () => {
    if (offlineReplayTimerRef.current) {
      clearInterval(offlineReplayTimerRef.current);
      offlineReplayTimerRef.current = null;
    }
  };

  const setOfflineWindowSeconds = (windowSeconds) => {
    const nextSeconds = Math.max(1, Number(windowSeconds) || 10);
    offlineReplayStatusRef.current = {
      ...offlineReplayStatusRef.current,
      windowSeconds: nextSeconds
    };
    if (offlineReplayStatusRef.current.loaded) {
      applyOfflineWindow();
    }
  };

  const seekOfflineReplay = (playhead) => {
    const rows = offlineReplayRowsRef.current;
    if (rows.length === 0) {
      return;
    }

    const nextPlayhead = clamp(Math.round(Number(playhead) || 0), 0, rows.length - 1);
    offlineReplayStatusRef.current = {
      ...offlineReplayStatusRef.current,
      playhead: nextPlayhead
    };
    applyOfflineWindow();
  };

  const pauseOfflineReplay = () => {
    stopOfflineTimer();
    offlineReplayStatusRef.current = {
      ...offlineReplayStatusRef.current,
      playing: false
    };
  };

  const playOfflineReplay = () => {
    const rows = offlineReplayRowsRef.current;
    if (rows.length === 0) {
      return;
    }

    if (offlineReplayStatusRef.current.playhead >= rows.length - 1) {
      offlineReplayStatusRef.current = {
        ...offlineReplayStatusRef.current,
        playhead: 0
      };
      applyOfflineWindow();
    }

    if (offlineReplayTimerRef.current) {
      return;
    }

    offlineReplayStatusRef.current = {
      ...offlineReplayStatusRef.current,
      playing: true
    };

    offlineReplayTimerRef.current = setInterval(() => {
      const currentRows = offlineReplayRowsRef.current;
      const state = offlineReplayStatusRef.current;
      if (!state.loaded || currentRows.length === 0) {
        pauseOfflineReplay();
        return;
      }

      if (state.playhead >= currentRows.length - 1) {
        pauseOfflineReplay();
        return;
      }

      offlineReplayStatusRef.current = {
        ...state,
        playhead: state.playhead + Math.max(1, Math.round(state.sampleRate / 10 * state.playbackSpeedMultiplier)),
        playing: true
      };
      applyOfflineWindow();
    }, 100); // 100ms interval = 10 updates/sec
  };

  const clearOfflineReplay = () => {
    pauseOfflineReplay();
    offlineReplayRowsRef.current = [];
    offlineReplayStatusRef.current = {
      loaded: false,
      playing: false,
      fileName: null,
      total: 0,
      playhead: 0,
      startIndex: 0,
      endIndex: 0,
      windowSeconds: 10,
      schema: []
    };
    resetTelemetryBuffer();
  };

  const requestPortList = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "list_ports" }));
    }
  };

  const switchComPort = (comPort) => {
    if (socketRef.current?.readyState === WebSocket.OPEN && comPort) {
      comActionStatusRef.current = `Switching to ${comPort}...`;
      socketRef.current.send(JSON.stringify({ type: "switch_port", comPort }));
    }
  };

  const toggleLogging = (enable) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "toggle_logging", enable: Boolean(enable) }));
    }
  };

  const requestBackendReplayStream = (fileName) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "start_replay", fileName: fileName || null }));
    }
  };

  const stopBackendReplayStream = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "stop_replay" }));
    }
  };

  const listLogs = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "list_logs" }));
    }
  };

  // Calculate sample rate from timestamp intervals
  const calculateSampleRate = (rows) => {
    if (rows.length < 2) return 100;
    // Calculate average time difference between samples
    let totalDiff = 0;
    let count = 0;
    for (let i = 1; i < Math.min(rows.length, 100); i++) {
      const diff = rows[i].timestamp - rows[i - 1].timestamp;
      if (diff > 0 && diff < 100) { // Only count reasonable diffs (0-100ms)
        totalDiff += diff;
        count++;
      }
    }
    if (count === 0) return 100;
    const avgIntervalMs = totalDiff / count;
    const sampleRate = Math.round(1000 / avgIntervalMs);
    return Math.max(10, Math.min(1000, sampleRate)); // Clamp between 10-1000 Hz
  };

  const loadOfflineReplay = (fileName) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: "load_replay", fileName: fileName || null }));
    }
  };

  const importLocalCsv = async (file) => {
    if (!file) {
      comActionStatusRef.current = "No file selected";
      return;
    }

    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
      if (lines.length < 2) {
        comActionStatusRef.current = "CSV appears empty or has no data rows";
        return;
      }

      const header = lines[0].split(",").map((h) => String(h || "").trim());

      // Determine timestamp column: prefer header named 'timestamp', fall back to 'iso_time', else first column
      let tsIndex = header.findIndex((h) => /timestamp/i.test(h));
      const isoIndex = header.findIndex((h) => /iso_time/i.test(h));
      if (tsIndex < 0 && isoIndex >= 0) tsIndex = isoIndex;
      if (tsIndex < 0) tsIndex = 0;

      const schemaIndices = header
        .map((name, idx) => ({ name, idx }))
        .filter(({ name, idx }) => idx !== tsIndex && !/iso_time/i.test(name))
        .map((x) => x.idx);

      const schema = schemaIndices.map((idx) => header[idx]);
      const rows = [];

      for (let i = 1; i < lines.length; i += 1) {
        const cols = lines[i].split(",");
        if (cols.length <= Math.max(tsIndex, ...schemaIndices)) {
          // skip malformed row
          continue;
        }

        let ts = Number(cols[tsIndex]);
        if (!Number.isFinite(ts)) {
          const parsed = Date.parse(cols[tsIndex]);
          ts = Number.isFinite(parsed) ? parsed : NaN;
        }

        if (!Number.isFinite(ts)) {
          // skip rows without valid timestamp
          continue;
        }

        const values = schemaIndices.map((idx) => {
          const v = Number(cols[idx]);
          return Number.isFinite(v) ? v : 0;
        });

        rows.push({ timestamp: ts, values });
      }

      stopOfflineTimer();
      offlineReplayRowsRef.current = rows;
      offlineReplayStatusRef.current = {
        loaded: true,
        playing: false,
        fileName: file.name || "local.csv",
        total: rows.length,
        playhead: rows.length > 0 ? Math.min(rows.length - 1, Math.max(0, Math.floor(rows.length / 2))) : 0,
        startIndex: 0,
        endIndex: 0,
        windowSeconds: offlineReplayStatusRef.current.windowSeconds || 10,
        schema,
        playbackSpeedMultiplier: 1.0,
        sampleRate: calculateSampleRate(rows)
      };

      if (schema.length > 0) {
        availableChannelsRef.current = schema;
      }

      if (rows.length > 0) {
        const firstTimestamp = rows[0].timestamp;
        const initialEndIndex = rows.findIndex(
          (row) => row.timestamp >= firstTimestamp + Math.max(1, Number(offlineReplayStatusRef.current.windowSeconds) || 10) * 1000
        );
        offlineReplayStatusRef.current = {
          ...offlineReplayStatusRef.current,
          playhead: initialEndIndex >= 0 ? initialEndIndex : rows.length - 1,
          total: rows.length
        };
        resetTelemetryBuffer();
        applyOfflineWindow();
      } else {
        resetTelemetryBuffer();
      }

      comActionStatusRef.current = `Imported ${file.name || 'local.csv'} (${rows.length})`;
    } catch (err) {
      comActionStatusRef.current = `Failed to import CSV: ${String(err.message || err)}`;
    }
  };

  useEffect(() => {
    let reconnectTimer = null;
    let unmounted = false;

    const scheduleReconnect = () => {
      if (unmounted || reconnectTimer) {
        return;
      }

      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    };

    const connect = () => {
      if (unmounted) {
        return;
      }

      statusRef.current = "connecting";
      const socket = new WebSocket(WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        statusRef.current = "connected";
        requestPortList();
        listLogs();
      };

      socket.onclose = () => {
        if (socketRef.current === socket) {
          socketRef.current = null;
        }
        statusRef.current = "disconnected";
        scheduleReconnect();
      };

      socket.onerror = () => {
        statusRef.current = "error";
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === "ports_list") {
            availablePortsRef.current = Array.isArray(message.ports) ? message.ports : [];
            currentComPortRef.current = String(message.currentComPort || currentComPortRef.current || "");
            comActionStatusRef.current = "COM list updated";
            return;
          }

          if (message.type === "com_state") {
            currentComPortRef.current = String(message.currentComPort || "");
            comActionStatusRef.current = String(message.message || "COM connected");
            return;
          }

          if (message.type === "com_error") {
            comActionStatusRef.current = String(message.message || "COM command failed");
            return;
          }

          if (message.type === "logger_state") {
            loggerStatusRef.current = {
              isLogging: Boolean(message.isLogging),
              fileName: message.fileName || null,
              logDir: message.logDir || "./logs",
              bufferSize: Number.isFinite(message.bufferSize) ? message.bufferSize : 0
            };
            if (message.isLogging) {
              comActionStatusRef.current = `Logging to ${message.fileName}`;
            } else {
              comActionStatusRef.current = "Logging stopped";
            }
            return;
          }

          if (message.type === "telemetry_schema") {
            const schema = Array.isArray(message.schema)
              ? message.schema.filter((channel) => typeof channel === "string" && channel.length > 0)
              : [];
            if (schema.length > 0) {
              availableChannelsRef.current = schema;
            }
            return;
          }

          if (message.type === "replay_loaded") {
            const schema = Array.isArray(message.schema)
              ? message.schema.filter((channel) => typeof channel === "string" && channel.length > 0)
              : [];
            const rows = Array.isArray(message.rows)
              ? message.rows
                .map((row) => ({
                  timestamp: Number(row?.timestamp) || Date.now(),
                  values: Array.isArray(row?.values) ? row.values : []
                }))
                .filter((row) => Number.isFinite(row.timestamp))
              : [];

            stopOfflineTimer();
            offlineReplayRowsRef.current = rows;
            offlineReplayStatusRef.current = {
              loaded: true,
              playing: false,
              fileName: message.fileName || null,
              total: rows.length,
              playhead: 0,
              startIndex: 0,
              endIndex: 0,
              windowSeconds: offlineReplayStatusRef.current.windowSeconds || 10,
              schema
            };

            if (schema.length > 0) {
              availableChannelsRef.current = schema;
            }

            if (rows.length > 0) {
              const firstTimestamp = rows[0].timestamp;
              const initialEndIndex = rows.findIndex(
                (row) => row.timestamp >= firstTimestamp + Math.max(1, Number(offlineReplayStatusRef.current.windowSeconds) || 10) * 1000
              );
              offlineReplayStatusRef.current = {
                ...offlineReplayStatusRef.current,
                playhead: initialEndIndex >= 0 ? initialEndIndex : rows.length - 1
              };
              resetTelemetryBuffer();
              applyOfflineWindow();
            } else {
              resetTelemetryBuffer();
            }

            comActionStatusRef.current = `Loaded ${message.fileName || "offline log"}`;
            return;
          }

          if (message.type === "replay_state") {
            const wasActive = Boolean(replayStatusRef.current.active);
            replayStatusRef.current = {
              active: Boolean(message.active),
              fileName: message.fileName || null,
              total: Number.isFinite(message.total) ? message.total : 0
            };

            if (!wasActive && replayStatusRef.current.active) {
              // Start replay with a clean timeline to avoid mixing with live timestamps.
              resetTelemetryBuffer();
            }

            comActionStatusRef.current = message.active ? `Replaying ${message.fileName || 'latest'}` : "Replay stopped";
            return;
          }

          if (message.type === "logs_list") {
            logsListRef.current = Array.isArray(message.files) ? message.files : [];
            comActionStatusRef.current = `Found ${logsListRef.current.length} log(s)`;
            return;
          }

          if (message.type === "error") {
            comActionStatusRef.current = String(message.message || "Serial error");
            return;
          }

          if (message.type === "drop") {
            comActionStatusRef.current = String(message.reason || "Payload dropped");
            return;
          }

          if (message.type === "status") {
            comActionStatusRef.current = String(message.message || "Backend status");
            return;
          }

          if (message.type !== "telemetry") {
            return;
          }

          // While offline replay is loaded, ignore live frames so the chart timeline stays stable.
          if (offlineReplayStatusRef.current.loaded && message.rawHex) {
            return;
          }

          const timestampMillis = Number.isFinite(message.timestamp) ? message.timestamp : Date.now();
          const timestampSeconds = timestampMillis / 1000;

          const schemaChannels = Array.isArray(message.schema)
            ? message.schema.filter((channel) => typeof channel === "string" && channel.length > 0)
            : [];
          const payloadChannels =
            message.channels && typeof message.channels === "object"
              ? Object.keys(message.channels)
              : [];

          const nextChannels =
            schemaChannels.length > 0
              ? schemaChannels
              : payloadChannels.length > 0
                ? payloadChannels
                : availableChannelsRef.current;

          if (
            nextChannels.length > 0 &&
            (nextChannels.length !== availableChannelsRef.current.length ||
              nextChannels.some((channel, index) => channel !== availableChannelsRef.current[index]))
          ) {
            availableChannelsRef.current = nextChannels;
          }

          const data = telemetryRef.current;
          const knownChannels = new Set([
            ...Object.keys(data.channels),
            ...availableChannelsRef.current
          ]);

          data.x.push(timestampSeconds);

          for (const channel of knownChannels) {
            if (!Array.isArray(data.channels[channel])) {
              data.channels[channel] = [];
            }

            let value = 0;
            if (
              message.channels &&
              typeof message.channels === "object" &&
              Number.isFinite(message.channels[channel])
            ) {
              value = message.channels[channel];
            } else if (Array.isArray(message.schema) && Array.isArray(message.values)) {
              const selectedIndex = message.schema.indexOf(channel);
              if (selectedIndex >= 0 && Number.isFinite(message.values[selectedIndex])) {
                value = message.values[selectedIndex];
              } else if (Number.isFinite(message.values[0])) {
                value = message.values[0];
              }
            } else if (Array.isArray(message.values) && Number.isFinite(message.values[0])) {
              value = message.values[0];
            }

            data.channels[channel].push(value);
          }

          if (data.x.length > MAX_POINTS) {
            data.x.shift();
            for (const channel of Object.keys(data.channels)) {
              if (data.channels[channel].length > 0) {
                data.channels[channel].shift();
              }
            }
          }
        } catch {
          statusRef.current = "parse-error";
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, []);
  const setPlaybackSpeed = (speedMultiplier) => {
    const speed = Math.max(0.1, Math.min(4.0, speedMultiplier)); // Clamp 0.1x to 4x
    offlineReplayStatusRef.current = {
      ...offlineReplayStatusRef.current,
      playbackSpeedMultiplier: speed
    };
  };


  return {
    telemetryRef,
    availableChannelsRef,
    statusRef,
    availablePortsRef,
    currentComPortRef,
    comActionStatusRef,
    loggerStatusRef,
    replayStatusRef,
    logsListRef,
    offlineReplayStatusRef,
    requestPortList,
    switchComPort,
    toggleLogging,
    listLogs,
    loadOfflineReplay,
    importLocalCsv,
    playOfflineReplay,
    pauseOfflineReplay,
    seekOfflineReplay,
    setOfflineWindowSeconds,
    setPlaybackSpeed,
    clearOfflineReplay
  };
};
