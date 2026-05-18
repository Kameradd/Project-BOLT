import { useEffect, useMemo, useState } from "react";
import UplotPanel from "./UplotPanel.jsx";
import { useTelemetryBuffer } from "./useTelemetryBuffer.js";
import RpmGauge from "./components/RpmGauge.jsx";
import BmsGauge from "./components/BmsGauge.jsx";
import EcuGauge from "./components/EcuGauge.jsx";
import GforceAndSteering from "./components/GforceAndSteering.jsx";
import ThrottleAndBrake from "./components/ThrottleAndBrake.jsx";
import logoBimsak from "./assets/white_no bg.svg";
import TimeStamp from "./components/TimeStamp.jsx";
import "./styles.css";

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
  { group: "RPM_AUX", includes: ["rpmpa15", "rpmpb3", "rpmpb5", "rpmpb8"] }, // specific rpmp* channels grouped together
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
  const {
    telemetryRef,
    availableChannelsRef,
    statusRef,
    availablePortsRef,
    currentComPortRef,
    comActionStatusRef,
    loggerStatusRef,
    requestPortList,
    switchComPort,
    toggleLogging,
    listLogs,
    loadOfflineReplay,
    playOfflineReplay,
    pauseOfflineReplay,
    seekOfflineReplay,
    setOfflineWindowSeconds,
    clearOfflineReplay,
    offlineReplayStatusRef,
    logsListRef
  } = useTelemetryBuffer();
  const [status, setStatus] = useState("disconnected");
  const [availablePorts, setAvailablePorts] = useState([]);
  const [selectedComPort, setSelectedComPort] = useState("");
  const [comActionStatus, setComActionStatus] = useState("");
  const [loggerStatus, setLoggerStatus] = useState({
    isLogging: false,
    fileName: null,
    logDir: "./logs",
    bufferSize: 0
  });
  const [offlineReplayStatus, setOfflineReplayStatus] = useState({
    loaded: false,
    playing: false,
    fileName: null,
    total: 0,
    playhead: 0,
    startIndex: 0,
    endIndex: 0,
    windowSeconds: 10,
    schema: []
  });
  const [logsList, setLogsList] = useState([]);
  const [selectedLogFile, setSelectedLogFile] = useState("");
  const [offlineWindowSeconds, setOfflineWindowSecondsState] = useState(10);

  // STATE BARU: Untuk mengatur Menu Tab
  const [activeTab, setActiveTab] = useState("dashboard");

  const [availableChannels, setAvailableChannels] = useState(availableChannelsRef.current);
  const [selectedChannels, setSelectedChannels] = useState(
    availableChannelsRef.current.length > 0
      ? availableChannelsRef.current.slice(0, Math.min(4, availableChannelsRef.current.length))
      : []
  );
  const plotGroups = useMemo(() => buildPlotGroups(selectedChannels), [selectedChannels]);

  useEffect(() => {
    const timer = setInterval(() => {
      setStatus(statusRef.current);
      setComActionStatus(comActionStatusRef.current || "");
      setLoggerStatus({ ...loggerStatusRef.current });
      setOfflineReplayStatus({ ...offlineReplayStatusRef.current });
      setOfflineWindowSecondsState((prev) => {
        const next = Number(offlineReplayStatusRef.current.windowSeconds) || 10;
        return prev === next ? prev : next;
      });

      const nextPorts = Array.isArray(availablePortsRef.current) ? availablePortsRef.current : [];
      setAvailablePorts((prev) => {
        const prevPaths = prev.map((port) => port.path);
        const nextPaths = nextPorts.map((port) => port.path);
        return arraysEqual(prevPaths, nextPaths) ? prev : [...nextPorts];
      });

      const activePort = String(currentComPortRef.current || "");
      setSelectedComPort((prev) => {
        // Keep user selection while choosing another port; only auto-sync when unset/invalid.
        if (!prev && activePort) {
          return activePort;
        }

        if (prev && nextPorts.some((port) => port.path === prev)) {
          return prev;
        }

        return activePort || prev;
      });

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
        return nextChannels.length > 0 ? nextChannels.slice(0, Math.min(4, nextChannels.length)) : [];
      });
      // sync logs list
      setLogsList((prev) => {
        const next = Array.isArray(logsListRef.current) ? logsListRef.current : [];
        // shallow compare by length and names
        if (prev.length === next.length && prev.every((p, i) => p.name === next[i]?.name)) {
          return prev;
        }
        return [...next];
      });
    }, 250);

    return () => clearInterval(timer);
  }, [availableChannelsRef, statusRef, availablePortsRef, currentComPortRef, comActionStatusRef, loggerStatusRef, offlineReplayStatusRef]);

  const toggleChannel = (channel) => {
    setSelectedChannels((prev) => {
      if (prev.includes(channel)) {
        return prev.filter((item) => item !== channel);
      }
      return [...prev, channel];
    });
  };

  const handleSwitchPort = () => {
    if (selectedComPort) {
      switchComPort(selectedComPort);
    }
  };

  return (
    <main className="layout">
      {/* HEADER DIROMBAK UNTUK MENU NAVIGASI */}
      <header className="topbar" style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Logo Bimasakti */}
          <img src={logoBimsak} alt="Logo Bimasakti"
            style={{ width: '120px' }} />

          {/* Teks bolt */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <h1 style={{
                color: '#CE2027',
                margin: 0,
                fontFamily: "'Formula1-Bold', sans-serif"
              }}>BOLT</h1>
              <div style={{ fontSize: '14px', color: status === 'connected' ? '#CE2027' : '#454545', fontWeight: 'bold' }}>
                SYSTEM STATUS: {status.toUpperCase()}
              </div>
            </div>
            <p style={{
              margin: 0,
              marginTop: '4px',
              fontFamily: "'Formula1-Regular', sans-serif"
            }}>Bimasakti On-site Live Telemetry</p>
            <div style={{
              display: 'flex',
              alignItems: 'center', /* Menyejajarkan jam dan tombol di tengah secara vertikal */
              gap: '24px',          /* Jarak antara tulisan Jam dengan dropdown COM */
              marginTop: '2px',
              flexWrap: 'wrap'
            }}>

              {/* 1. Komponen Jam */}
              <div style={{
                minWidth: '300px',
              }}>
                <TimeStamp telemetryRef={telemetryRef} channelName="TimeSampling" />
              </div>

              {/* 2. Rentetan Tombol COM Port */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  value={selectedComPort}
                  onChange={(event) => setSelectedComPort(event.target.value)}
                  style={{
                    minWidth: '120px',
                    padding: '6px 8px',
                    backgroundColor: '#111827',
                    color: '#e5e7eb',
                    border: '1px solid #334155',
                    borderRadius: '6px'
                  }}
                >
                  <option value="">Select COM</option>
                  {availablePorts.map((port) => (
                    <option key={port.path} value={port.path}>
                      {port.path}
                    </option>
                  ))}
                </select>

                <button
                  onClick={requestPortList}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: 'transparent',
                    color: '#e2e8f0',
                    border: '1px solid #64748b',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  Refresh COM
                </button>

                <button
                  onClick={handleSwitchPort}
                  disabled={!selectedComPort}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: selectedComPort ? '#22d3ee' : '#1f2937',
                    color: selectedComPort ? '#0f172a' : '#94a3b8',
                    border: '1px solid #22d3ee',
                    borderRadius: '6px',
                    cursor: selectedComPort ? 'pointer' : 'not-allowed',
                    fontWeight: 'bold'
                  }}
                >
                  Use Port
                </button>

                <button
                  onClick={() => toggleLogging(!loggerStatus.isLogging)}
                  style={{
                    padding: '6px 10px',
                    backgroundColor: loggerStatus.isLogging ? '#ef4444' : '#1f2937',
                    color: loggerStatus.isLogging ? '#fff' : '#94a3b8',
                    border: `1px solid ${loggerStatus.isLogging ? '#ef4444' : '#64748b'}`,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontWeight: 'bold'
                  }}
                >
                  {loggerStatus.isLogging ? '⏹ Stop Log' : '⏺ Start Log'}
                </button>

                <span style={{ color: '#93c5fd', fontSize: '12px' }}>
                  Active: {currentComPortRef.current || 'n/a'}
                </span>
              </div>
            </div>


            <p style={{ margin: '6px 0 0', fontSize: '12px', color: '#94a3b8' }}>
              {comActionStatus}
            </p>
          </div>

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
        <section className="card"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '80vh',
            border: 'none',
          }}>

          {/* 2. RAHASIANYA DI SINI: Kita bungkus RpmGauge dengan div "Kaca Pembesar" */}
          <div style={{
            position: 'relative', /* Wajib ditambah relative agar tumpang tindihnya pas */
            transform: 'scale(1.6)', /* <--- Ubah angka 1.8 ini. 1.0 ukuran asli, 2.0 dua kali lipat */
            transformOrigin: 'top center',
            marginBottom: '150px' /* Memberi ruang di bawah karena efek scale */
          }}>
            <RpmGauge
              telemetryRef={telemetryRef}
              channelName="RPM"
              speedChannel="speed"
              gearChannel="Gear"
            />

            {/* Baterai Bimasakti ditumpuk di atasnya */}
            <BmsGauge
              telemetryRef={telemetryRef}
              channelName="bmsSOC"
              voltageChannel="bmsVolts"
              currentChannel="bmsCurrent"
              tempChannel="bmsTemp"
              hyStatusChannel="HyStatus"
            />
            {/* Indikator ECU Temp dengan Sliding Mask */}
            <EcuGauge
              telemetryRef={telemetryRef}
              channelName="engineTemp"
            />

            {/* G-Force Vector & Steering Angle */}
            <GforceAndSteering
              telemetryRef={telemetryRef}
              channelNameimuAx="imuAx"
              channelNameimuAy="imuAy"
              channelNameSteering="steering"
            />

            {/*Throttle and Brake*/}
            <ThrottleAndBrake
              telemetryRef={telemetryRef}
              throttleChannel="throttle"
              brakeChannel="RawBrake"
            />

            {/* Timestamp */}
            <TimeStamp
              telemetryRef={telemetryRef}
              channelName="TimeSampling"
            />

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

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <select
                value={selectedLogFile}
                onChange={(e) => setSelectedLogFile(e.target.value)}
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#0b1220',
                  color: '#e5e7eb',
                  border: '1px solid #334155',
                  borderRadius: '6px'
                }}
              >
                <option value="">(latest)</option>
                {logsList.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>

              <button
                onClick={() => listLogs()}
                style={{
                  padding: '6px 10px',
                  backgroundColor: '#111827',
                  color: '#e2e8f0',
                  border: '1px solid #64748b',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Refresh Logs
              </button>

              <button
                onClick={() => loadOfflineReplay(selectedLogFile || null)}
                style={{
                  padding: '8px 12px',
                  backgroundColor: '#f59e0b',
                  color: '#0f172a',
                  border: '1px solid #b45309',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                📂 Load Offline
              </button>

              <button
                onClick={() => {
                  if (offlineReplayStatus.playing) {
                    pauseOfflineReplay();
                  } else {
                    playOfflineReplay();
                  }
                }}
                disabled={!offlineReplayStatus.loaded}
                style={{
                  padding: '8px 12px',
                  backgroundColor: !offlineReplayStatus.loaded
                    ? '#1f2937'
                    : offlineReplayStatus.playing
                      ? '#f97316'
                      : '#22c55e',
                  color: !offlineReplayStatus.loaded ? '#94a3b8' : '#0f172a',
                  border: '1px solid #b45309',
                  borderRadius: '6px',
                  cursor: !offlineReplayStatus.loaded ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {offlineReplayStatus.playing ? '⏸ Pause' : '▶ Play'}
              </button>

              <button
                onClick={() => clearOfflineReplay()}
                disabled={!offlineReplayStatus.loaded}
                style={{
                  padding: '8px 12px',
                  backgroundColor: !offlineReplayStatus.loaded ? '#1f2937' : '#ef4444',
                  color: !offlineReplayStatus.loaded ? '#94a3b8' : '#fff',
                  border: '1px solid #ef4444',
                  borderRadius: '6px',
                  cursor: !offlineReplayStatus.loaded ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Exit Offline
              </button>

              <span style={{ fontSize: '12px', color: '#f59e0b' }}>
                {offlineReplayStatus.loaded
                  ? `Loaded ${offlineReplayStatus.fileName || 'latest'} (${offlineReplayStatus.total})`
                  : 'Offline not loaded'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap' }}>
              <label style={{ color: '#cbd5e1', fontSize: '12px' }}>
                Window (s)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={offlineWindowSeconds}
                  onChange={(e) => {
                    const nextSeconds = Math.max(1, Number(e.target.value) || 1);
                    setOfflineWindowSecondsState(nextSeconds);
                    setOfflineWindowSeconds(nextSeconds);
                  }}
                  style={{
                    marginLeft: '8px',
                    width: '72px',
                    padding: '4px 6px',
                    backgroundColor: '#0b1220',
                    color: '#e5e7eb',
                    border: '1px solid #334155',
                    borderRadius: '6px'
                  }}
                />
              </label>

              <label style={{ color: '#cbd5e1', fontSize: '12px', flex: '1 1 320px' }}>
                Scrub
                <input
                  type="range"
                  min="0"
                  max={Math.max(0, offlineReplayStatus.total - 1)}
                  value={Math.min(offlineReplayStatus.playhead, Math.max(0, offlineReplayStatus.total - 1))}
                  disabled={!offlineReplayStatus.loaded}
                  onChange={(e) => seekOfflineReplay(Number(e.target.value))}
                  style={{ width: '100%', marginTop: '6px' }}
                />
              </label>

              <span style={{ fontSize: '12px', color: '#93c5fd' }}>
                {offlineReplayStatus.loaded
                  ? `Frame ${offlineReplayStatus.playhead + 1}/${Math.max(offlineReplayStatus.total, 1)} | Window ${offlineReplayStatus.windowSeconds}s`
                  : 'Load a log to start playback'}
              </span>
            </div>
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