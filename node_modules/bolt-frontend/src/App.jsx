import { useEffect, useState } from "react";
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

const arraysEqual = (left, right) =>
  left.length === right.length && left.every((item, index) => item === right[index]);

const App = () => {
  const { telemetryRef, availableChannelsRef, statusRef } = useTelemetryBuffer();
  const [status, setStatus] = useState("disconnected");
  const [availableChannels, setAvailableChannels] = useState(availableChannelsRef.current);
  const [selectedChannels, setSelectedChannels] = useState(
    availableChannelsRef.current.length > 0 ? [availableChannelsRef.current[0]] : []
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(statusRef.current);

      const nextChannels = availableChannelsRef.current;
      setAvailableChannels((prev) => (arraysEqual(prev, nextChannels) ? prev : [...nextChannels]));
      setSelectedChannels((prev) => {
        const filtered = prev.filter((channel) => nextChannels.includes(channel));
        if (filtered.length > 0) {
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
        <h1>Project BOLT</h1>
        <p>FSAE Trackside Telemetry Dashboard</p>
      </header>

      <section className="card">
        <div className="status-row">
          <span>WebSocket: </span>
          <strong>{status}</strong>
        </div>

        <div className="channel-picker">
          <p className="picker-title">Display channels ({selectedChannels.length})</p>
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
            {selectedChannels.map((channel) => (
              <div className="plot-card" key={channel}>
                <UplotPanel
                  telemetryRef={telemetryRef}
                  channelLabel={channel}
                  lineColor={PLOT_COLORS[selectedChannels.indexOf(channel) % PLOT_COLORS.length]}
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
