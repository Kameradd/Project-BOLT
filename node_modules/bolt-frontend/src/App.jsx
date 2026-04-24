import { useEffect, useMemo, useState } from "react";
import UplotPanel from "./UplotPanel.jsx";
import { useTelemetryBuffer } from "./useTelemetryBuffer.js";
import RpmGauge from "./components/RpmGauge.jsx";
import BmsGauge from "./components/BmsGauge.jsx";
import EcuGauge from "./components/EcuGauge.jsx";

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

  // STATE BARU: Untuk mengatur Menu Tab
  const [activeTab, setActiveTab] = useState("dashboard");

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
      {/* HEADER DIROMBAK UNTUK MENU NAVIGASI */}
      <header className="topbar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ color: '#CE2027' }}>BOLT</h1>
          <p>Bimasakti On-site Live Telemetry</p>
        </div>

        <nav style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setActiveTab("dashboard")}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === "dashboard" ? "#CE2027" : "transparent",
              color: activeTab === "dashboard" ? "black" : "white",
              border: '1px solid #CE2027', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            HUD VIEW
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            style={{
              padding: '10px 20px',
              backgroundColor: activeTab === "analytics" ? "#22d3ee" : "transparent",
              color: activeTab === "analytics" ? "black" : "white",
              border: '1px solid #22d3ee', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold'
            }}
          >
            ENGINEERING VIEW
          </button>
        </nav>
      </header>

      {/* RUANGAN 1: DASHBOARD HUD F1 KITA */}
      {activeTab === "dashboard" && (
        // 1. Aku ubah minHeight dari 60vh menjadi 80vh agar kotaknya lebih panjang ke bawah memenuhi layar
        <section className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '80vh' }}>

          {/* 2. RAHASIANYA DI SINI: Kita bungkus RpmGauge dengan div "Kaca Pembesar" */}
          <div style={{
            position: 'relative', /* Wajib ditambah relative agar tumpang tindihnya pas */
            transform: 'scale(1.6)', /* <--- Ubah angka 1.8 ini. 1.0 ukuran asli, 2.0 dua kali lipat */
            transformOrigin: 'top center',
            marginBottom: '150px' /* Memberi ruang di bawah karena efek scale */
          }}>
            <RpmGauge
              telemetryRef={telemetryRef}
              channelName="ECU_RPM"
              speedChannel="GPS_Speed"
              gearChannel="Gear"
            />

            {/* Baterai Bimasakti ditumpuk di atasnya */}
            <BmsGauge
              telemetryRef={telemetryRef}
              channelName="BMS_SOC"
              voltageChannel="BMS_V"
              currentChannel="BMS_A"
              tempChannel="BMS_Temp_Max"
            />
            {/* Indikator ECU Temp dengan Sliding Mask */}
            <EcuGauge
              telemetryRef={telemetryRef}
              channelName="ECU_Temp"
            />

          </div>

          <div style={{ fontSize: '16px', color: status === 'connected' ? '#39ff14' : '#f87171', fontWeight: 'bold' }}>
            SYSTEM STATUS: {status.toUpperCase()}
          </div>
        </section>
      )}

      {/* RUANGAN 2: KODE ANALITIK ASLI KOORMU */}
      {activeTab === "analytics" && (
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
      )}
      <p>By: Kertya & Didan</p>

    </main>
  );
};

export default App;

/*
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
*/