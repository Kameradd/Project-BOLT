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
  const telemetryRef = useRef({
    x: [],
    channels: {
      [DEFAULT_CHANNEL]: []
    }
  });

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

  return {
    telemetryRef,
    availableChannelsRef,
    statusRef,
    availablePortsRef,
    currentComPortRef,
    comActionStatusRef,
    requestPortList,
    switchComPort
  };
};
