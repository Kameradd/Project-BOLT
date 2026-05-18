import React, { useState, useEffect, useRef } from "react";
// Pastikan path ini benar sesuai lokasi gambarmu
import throttleIcon from "../assets/throttleline.svg";
import brakeIcon from "../assets/brakeline.svg";

const ThrottleAndBrake = ({ telemetryRef, throttleChannel = "throttle", brakeChannel = "RawBrake" }) => {
    // State untuk menampung data throttle dan brake
    const [currentThrottle, setCurrentThrottle] = useState(0);
    const [currentBrake, setCurrentBrake] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        let angle = 0; // Untuk simulasi

        // Helper to find channel with fallback names
        const getChannelData = (channels, primary, fallbacks = []) => {
            if (channels[primary]) return channels[primary];
            for (const fallback of fallbacks) {
                if (channels[fallback]) return channels[fallback];
            }
            return null;
        };

        const renderFrame = () => {
            // --- MODE SIMULASI ---
            /*
            const simulatedThr = Math.abs(Math.sin(angle)) * 100; // Simulasi 0% - 100%
            const simulatedBrk = Math.abs(Math.cos(angle)) * 100; // Simulasi 0% - 100%

            setCurrentThrottle(simulatedThr);
            setCurrentBrake(simulatedBrk);
            angle += 0.02;
            */

            // --- MODE RILL (Buka komen ini saat konek ke ESP32) ---
            if (telemetryRef.current) {
                const thrData = getChannelData(
                    telemetryRef.current.channels,
                    throttleChannel,
                    ["throttle", "Throttle"]
                );
                if (thrData && thrData.length > 0) setCurrentThrottle(thrData[thrData.length - 1]);

                const brkData = getChannelData(
                    telemetryRef.current.channels,
                    brakeChannel,
                    ["RawBrake", "Brake_Raw"]
                );
                if (brkData && brkData.length > 0) setCurrentBrake(brkData[brkData.length - 1]);
            }


            rafRef.current = requestAnimationFrame(renderFrame);
        };

        rafRef.current = requestAnimationFrame(renderFrame);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };

    }, [telemetryRef, throttleChannel, brakeChannel]);

    // Memastikan nilai selalu di antara 0 sampai 100
    const safeThrottle = Math.min(Math.max(currentThrottle, 0), 100);

    const normalizedBrake = (currentBrake) / 2048 * 100; // Normalisasi dari -100..100 ke 0..100
    const safeBrake = Math.min(Math.max(normalizedBrake, 0), 100);

    return (
        <div style={{
            position: 'absolute',
            top: 40,             /* <--- GESER POSISI Y DI SINI */
            left: -240,            /* <--- GESER POSISI X DI SINI */
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',          // Jarak antara baris Throttle dan Brake
            zIndex: 6,
            pointerEvents: 'none',
            zoom: 0.9
        }}>

            {/* --- BARIS THROTTLE --- */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {/* Teks Angka */}
                <div style={{ width: '80px', textAlign: 'right' }}>
                    <span style={{
                        color: '#ffffff',
                        fontFamily: "'Orbitron', sans-serif",
                        fontWeight: 'Bold',
                        fontSize: '8px'
                    }}>
                        {Math.round(safeThrottle)}
                    </span>
                </div>
                {/* Bar SVG (Masking) */}
                <div style={{ width: '125px', height: '20px', position: 'relative' }}>
                    <img
                        src={throttleIcon}
                        alt="Throttle Bar"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'fill',

                            // RUMUS MASKING: Memotong sisa area dari kanan
                            clipPath: `inset(0% ${100 - safeThrottle}% 0% 0%)`,
                        }}
                    />
                </div>
            </div>

            {/* --- BARIS BRAKE --- */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {/* Teks Angka */}
                <div style={{ width: '80px', textAlign: 'right' }}>
                    <span style={{
                        color: '#ffffff',
                        fontFamily: "'Orbitron', sans-serif",
                        fontSize: '8px',
                        fontWeight: 'Bold'
                    }}>
                        {Math.round(safeBrake)}
                    </span>
                </div>
                {/* Bar SVG (Masking) */}
                <div style={{ width: '125px', height: '20px', position: 'relative' }}>
                    <img
                        src={brakeIcon}
                        alt="Brake Bar"
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'fill',
                            // RUMUS MASKING: Memotong sisa area dari kanan
                            clipPath: `inset(0% ${100 - safeBrake}% 0% 0%)`
                        }}
                    />
                </div>
            </div>

        </div>
    );
};

export default ThrottleAndBrake;