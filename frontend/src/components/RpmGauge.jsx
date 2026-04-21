import React, { useEffect, useState, useRef } from 'react';
import rpmBackground from '../assets/rpm-bg.svg';
import rpmBar from '../assets/rpm-bar.svg';
import rpmNeedle from '../assets/rpmNeedle.svg';
import numberbg from '../assets/number.svg';

// 1. Tambahkan props speedChannel dan gearChannel
const RpmGauge = ({ telemetryRef, channelName, speedChannel, gearChannel }) => {
    const size = 310;
    const strokeWidth = 50;
    const radius = (size - strokeWidth) / 2;
    const center = size / 2;

    const startAngle = 131;
    const sweepAngle = 229;
    const needleStartAngle = 225; // Sudut awal jarum saat RPM = 0
    const needleSweepAngle = 223;

    const circumference = 2 * Math.PI * radius;
    const arcLength = (sweepAngle / 360) * circumference;

    const dashArray = `${arcLength} ${circumference}`;

    // 2. State untuk masing-masing data
    const [currentRpm, setCurrentRpm] = useState(0);
    const [currentSpeed, setCurrentSpeed] = useState(0);
    const [currentGear, setCurrentGear] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        let angle = 0; // Hanya untuk simulasi
        const renderFrame = () => {
            /*
            //mode simulasi
            const simulatedRpm = Math.abs(Math.sin(angle) * 15000);
            setCurrentRpm(simulatedRpm);
            angle += 0.001;
            
            */
            //mode rill
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
                        if (gearVal == 0) gearVal = 'N';
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
    const dashOffset = arcLength - (arcLength * fillPercentage);
    const fillLength = arcLength * fillPercentage;
    const dynamicDashArray = `${fillLength} ${circumference}`;
    const needleAngle = needleStartAngle + (fillPercentage * needleSweepAngle);
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
            {/* LAYER 1.5: angka (FIGMA) */}
            <img
                src={numberbg}
                alt="RPM Numbers"
                style={{
                    position: 'absolute',
                    top: -14,
                    left: 8,
                    width: '94.7%',
                    height: '94.7%',
                    zIndex: 3,
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

            {/* LAYER 2.5: JARUM DINAMIS (NEEDLE) */}
            <img
                src={rpmNeedle} /* Jangan lupa import file svg-nya di atas ya! */
                style={{
                    position: 'absolute',

                    /* --- OPSI A: KALAU KAMU PAKAI TRIK FIGMA DI ATAS --- */
                    top: -0,   // Samakan dengan background
                    left: -0,  // Samakan dengan background
                    width: '100%',
                    height: '100%',
                    transformOrigin: 'center center', // Karena sumbunya sudah di tengah frame

                    /* --- OPSI B: KALAU JARUMNYA DI-EXPORT KECIL (CUMA JARUMNYA SAJA) --- * /
                    // top: '50%',
                    // left: '50%',
                    // width: '20px',      // Sesuaikan lebar jarum asli
                    // height: '120px',    // Sesuaikan panjang jarum asli
                    // marginTop: '-100px', // Geser ke atas agar pangkalnya pas di tengah layar
                    // marginLeft: '-10px', // Geser ke kiri (setengah lebar)
                    // transformOrigin: '50% 85%', // Titik tumpu: X di tengah (50%), Y agak ke bawah (85%)
                    /* ------------------------------------------------------------------- */

                    zIndex: 4,
                    pointerEvents: 'none',

                    // Eksekusi putaran berdasarkan rumus matematika tadi
                    transform: `rotate(${needleAngle}deg)`,

                    // Kalau pakai simulasi (requestAnimationFrame), matikan transition ini.
                    // TAPI kalau nanti pakai data asli dari telemetri, nyalakan ini agar jarumnya mulus (tidak patah-patah)
                    //transition: 'transform 0.05s linear'
                }}
            />

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
                zIndex: 4,
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
                    zIndex: 5
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
                    zIndex: 5
                }}>

                    {currentGear}
                </h1>

            </div>

        </div>
    );
};

export default RpmGauge;