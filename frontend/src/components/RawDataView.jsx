import React, { useState } from "react";
import UplotPanel from "../UplotPanel.jsx";

const RawDataView = ({
    telemetryRef,
    availableChannels,
    selectedChannels,
    onToggleChannel,
    plotGroups,
    status,
    selectedLogFile,
    setSelectedLogFile,
    logsList,
    listLogs,
    loadOfflineReplay,
    importLocalCsv,
    playOfflineReplay,
    pauseOfflineReplay,
    seekOfflineReplay,
    clearOfflineReplay,
    offlineReplayStatus,
    offlineWindowSeconds,
    setOfflineWindowSeconds,
    setPlaybackSpeed,
    localFile,
    setLocalFile
}) => {
    return (
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

                    <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={(e) => setLocalFile(e.target.files ? e.target.files[0] : null)}
                        style={{ marginLeft: '8px' }}
                    />

                    <button
                        onClick={() => {
                            if (localFile) {
                                importLocalCsv(localFile);
                            }
                        }}
                        style={{
                            padding: '8px 12px',
                            backgroundColor: '#60a5fa',
                            color: '#0f172a',
                            border: '1px solid #1d4ed8',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 'bold'
                        }}
                    >
                        Import CSV
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
                            ? `Loaded ${offlineReplayStatus.fileName || 'latest'} (${offlineReplayStatus.total}) | ${offlineReplayStatus.sampleRate}Hz`
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

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ color: '#cbd5e1', fontSize: '12px' }}>Speed:</span>
                        {[0.5, 1, 1.5, 2].map((speed) => (
                            <button
                                key={speed}
                                onClick={() => setPlaybackSpeed(speed)}
                                style={{
                                    padding: '4px 10px',
                                    backgroundColor: offlineReplayStatus.playbackSpeedMultiplier === speed ? '#3b82f6' : '#1f2937',
                                    color: offlineReplayStatus.playbackSpeedMultiplier === speed ? '#fff' : '#cbd5e1',
                                    border: '1px solid #475569',
                                    borderRadius: '4px',
                                    fontSize: '12px',
                                    cursor: 'pointer',
                                    fontWeight: offlineReplayStatus.playbackSpeedMultiplier === speed ? 'bold' : 'normal'
                                }}
                            >
                                {speed}x
                            </button>
                        ))}
                    </div>
                    <span style={{ fontSize: '12px', color: '#93c5fd' }}>
                        {offlineReplayStatus.loaded
                            ? `Frame ${offlineReplayStatus.playhead + 1}/${Math.max(offlineReplayStatus.total, 1)} | Window ${offlineReplayStatus.windowSeconds}s`
                            : 'Load a log to start playback'}
                    </span>
                </div>
            </div>

            <div className="channel-picker">
                <p className="picker-title">
                    Raw Data - Display channels ({selectedChannels.length}) — IMU/RPM channels auto-group in one window
                </p>
                <div className="channel-grid">
                    {availableChannels.map((channel) => (
                        <label key={channel} className="channel-item">
                            <input
                                type="checkbox"
                                checked={selectedChannels.includes(channel)}
                                onChange={() => onToggleChannel(channel)}
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
    );
};

export default RawDataView;
