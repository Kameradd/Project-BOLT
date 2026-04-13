import { useEffect, useMemo, useState } from "react";
import UplotPanel from "./UplotPanel.jsx";
import { useTelemetryBuffer } from "./useTelemetryBuffer.js";

const PLOT_COLORS = [
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#f472b6",
  "#f87171",
  "#2dd4bf"
];

const GROUP_RULES = [
  { group: "IMU", startsWith: ["IMU_"] },
  { group: "RPM", includes: ["RPM"] },
  { group: "Susp", includes: ["Susp"] },
  { group: "APPS", includes: ["APPS"] },
  { group: "BMS", includes: ["BMS"] }
];

const arraysEqual = (left, right) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const inferUnitGroup = (channel) => {
  for (const rule of GROUP_RULES) {
    const startsWithMatch =
      Array.isArray(rule.startsWith) &&
      rule.startsWith.some((prefix) => channel.toUpperCase().startsWith(String(prefix).toUpperCase()));
    const includesMatch =
      Array.isArray(rule.includes) &&
      rule.includes.some((token) => channel.toUpperCase().includes(String(token).toUpperCase()));

    if (startsWithMatch || includesMatch) {
      return rule.group;
    }
  }

  return channel;
};

const hashChannel = (text) => {
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
};

const getChannelColor = (channel) => PLOT_COLORS[hashChannel(channel) % PLOT_COLORS.length];

const buildPlotGroups = (channels) => {
  const grouped = new Map();

  for (const channel of channels) {
    const groupKey = inferUnitGroup(channel);
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, []);
    }
    grouped.get(groupKey).push(channel);
  }

  return [...grouped.entries()].map(([groupKey, channelLabels]) => ({
    groupKey,
    channelLabels,
    title: channelLabels.length > 1 ? `${groupKey} (${channelLabels.length})` : channelLabels[0],
    lineColors: channelLabels.map((channel) => getChannelColor(channel))
  }));
};

const App = () => {
  const { telemetryRef, availableChannelsRef, statusRef } = useTelemetryBuffer();
  const [status, setStatus] = useState("disconnected");
  const [availableChannels, setAvailableChannels] = useState(availableChannelsRef.current);
  const [selectedChannels, setSelectedChannels] = useState(
    availableChannelsRef.current.length > 0 ? [availableChannelsRef.current[0]] : []
  );
  const plotGroups = useMemo(() => buildPlotGroups(selectedChannels), [selectedChannels]);

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(statusRef.current);

      const nextChannels = availableChannelsRef.current;
      setAvailableChannels((prev) => (arraysEqual(prev, nextChannels) ? prev : [...nextChannels]));
      setSelectedChannels((prev) => {
        const filtered = prev.filter((channel) => nextChannels.includes(channel));
        if (filtered.length > 0) {
          if (arraysEqual(prev, filtered)) {
            return prev;
          }
          return filtered;
        }
        return nextChannels.length > 0 ? [nextChannels[0]] : [];
      });
    }, 250);

    return () => clearInterval(timer);
  }, [availableChannelsRef, statusRef]);

  const toggleChannel = (channel) => {
    setSelectedChannels((prev) => {
      if (prev.includes(channel)) {
        return prev.filter((item) => item !== channel);
      }
      return [...prev, channel];
    });
  };

  return (
    <main className="layout">
      <header className="topbar">
        <h1>BOLT</h1>
        <p>Bimasakti On-site Live Telemetry</p>
      </header>

      <section className="card">
        <div className="status-row">
          <span>WebSocket: </span>
          <strong>{status}</strong>
        </div>

        <div className="channel-picker">
          <p className="picker-title">
            Display channels ({selectedChannels.length}) — IMU/RPM channels auto-group in one window
          </p>
          <div className="channel-grid">
            {availableChannels.map((channel) => (
              <label key={channel} className="channel-item">
                <input
                  type="checkbox"
                  checked={selectedChannels.includes(channel)}
                  onChange={() => toggleChannel(channel)}
                />
                <span>{channel}</span>
              </label>
            ))}
          </div>
        </div>

        {selectedChannels.length === 0 ? (
          <p className="empty-state">Select at least one channel to display charts.</p>
        ) : (
          <div className="plot-grid">
            {plotGroups.map((group, index) => (
              <div className="plot-card" key={group.groupKey}>
                <UplotPanel
                  telemetryRef={telemetryRef}
                  plotTitle={group.title}
                  channelLabels={group.channelLabels}
                  lineColors={group.lineColors}
                  perfEnabled={index === 0}
                />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
};

export default App;
