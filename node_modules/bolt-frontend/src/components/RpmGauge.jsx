import React, { useEffect, useState, useRef } from 'react';
import rpmBackground from '../assets/rpm-bg.svg';
import rpmBar from '../assets/rpm-bar.svg';

// 1. Tambahkan props speedChannel dan gearChannel
const RpmGauge = ({ telemetryRef, channelName, speedChannel, gearChannel }) => {
    const size = 310;
    const strokeWidth = 50;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;

    const startAngle = 135;
    const sweepAngle = 230;

    const circumference = 2 * Math.PI * radius;
    const arcLength = (sweepAngle / 360) * circumference;

    // 2. State untuk masing-masing data
    const [currentRpm, setCurrentRpm] = useState(0);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [currentGear, setCurrentGear] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        const renderFrame = () => {
            if (telemetryRef.current) {
                // --- AMBIL DATA RPM ---
                if (telemetryRef.current.channels[channelName]) {
                    const rpmData = telemetryRef.current.channels[channelName];
                    if (rpmData.length > 0) setCurrentRpm(rpmData[rpmData.length - 1]);
                }

                // --- AMBIL DATA SPEED ---
                if (speedChannel && telemetryRef.current.channels[speedChannel]) {
                    const speedData = telemetryRef.current.channels[speedChannel];
                    if (speedData.length > 0) setCurrentSpeed(speedData[speedData.length - 1]);
                }

                // --- AMBIL DATA GEAR ---
                if (gearChannel && telemetryRef.current.channels[gearChannel]) {
                    const gearData = telemetryRef.current.channels[gearChannel];
                    if (gearData.length > 0) {
                        let gearVal = gearData[gearData.length - 1];
                        // Opsional: Jika ECU mengirim angka 0 untuk Netral
                        if (gearVal === 0) gearVal = 'N';
                        setCurrentGear(gearVal);
                    }
                }
            }
            rafRef.current = requestAnimationFrame(renderFrame);
        };

        rafRef.current = requestAnimationFrame(renderFrame);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [telemetryRef, channelName, speedChannel, gearChannel]); // Jangan lupa tambahkan di array dependency

    const maxRpm = 15000;
    const safeRpm = Math.min(Math.max(currentRpm, 0), maxRpm);
    const fillPercentage = safeRpm / maxRpm;

    const fillLength = arcLength * fillPercentage;
    const dynamicDashArray = `${fillLength} ${circumference}`;

    return (
        <div style={{ position: 'relative', width: `${size}px`, height: `${size}px` }}>

            {/* LAYER 1: BACKGROUND STATIS (FIGMA) */}
            <img
                src={rpmBackground}
                alt="RPM Background"
                style={{
                    position: 'absolute',
                    top: -155,
                    left: -155,
                    width: '200%',
                    height: '200%',
                    zIndex: 1,
                    pointerEvents: 'none'
                }}
            />

            {/* LAYER 2: BAR GRADASI DINAMIS (TRUE SVG MASK) */}
            <svg
                width={size}
                height={size}
                style={{
                    position: 'absolute',
                    top: -5,
                    left: 0,
                    zIndex: 2,
                    filter: 'drop-shadow(0px 0px 8px rgba(234, 255, 0, 0.3))'
                }}
            >
                <defs>
                    <mask id="rpmMask">
                        <circle
                            cx={center} cy={center} r={radius}
                            fill="none"
                            stroke="white"
                            strokeWidth={strokeWidth}
                            strokeDasharray={dynamicDashArray}
                            strokeLinecap="butt"
                            transform={`rotate(${startAngle} ${center} ${center})`}
                        />
                    </mask>
                </defs>

                <image
                    href={rpmBar}
                    x="0" y="0"
                    width={size} height={size}
                    mask="url(#rpmMask)"
                />
            </svg>

            {/* LAYER 3: ANGKA DIGITAL & LABEL */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                alignItems: 'center',
                zIndex: 3,
                pointerEvents: 'none'
            }}>


                {/* Indikator Speed (Tengah) */}
                <h1 style={{
                    margin: '0',
                    color: 'white',
                    fontSize: '64px',
                    fontFamily: "'Orbitron', sans-serif",
                    letterSpacing: '4px',
                    fontWeight: 'medium',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    top: '30px',
                    zIndex: 4
                }}>
                    {Math.round(currentSpeed)}
                </h1>

                {/* Indikator Gear (Atas) */}
                <h1 style={{
                    margin: '0',
                    color: 'white',
                    fontSize: '80px',
                    fontFamily: "'Orbitron', sans-serif",
                    letterSpacing: '4px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    top: '63px',
                    left: '30px',
                    zIndex: 4
                }}>

                    {currentGear}
                </h1>

            </div>

        </div>
    );
};

export default RpmGauge;