import React, { useEffect, useState, useRef } from 'react';
// Pastikan file ecu-temp-bar.svg sudah ada di folder assets
import ecuTempBar from '../assets/ecu-temp-bar.svg';

const EcuGauge = ({ telemetryRef, channelName = "ECU_Temp" }) => {
    // State untuk menampung data suhu
    const [currentTemp, setCurrentTemp] = useState(0);
    const [currentVbatt, setVbatt] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        let angle = 0; // Untuk simulasi naik turun

        const renderFrame = () => {
            // --- MODE SIMULASI UNTUK TESTING ---
            // Suhu naik turun perlahan (misal dari 30 sampai 90 derajat)
            const simulatedTemp = 40 + Math.abs(Math.sin(angle)) * 60;
            setCurrentTemp(simulatedTemp);
            angle += 0.001;

            const simulatedvbatt = 11 + Math.sin(angle * 10) * 1; // Simulasi 460V - 540V
            setVbatt(simulatedvbatt);

            /*
            // --- MODE RILL MENGGUNAKAN DATA TELEMETRI ---
            // --- KODE ASLI (Buka komen ini saat pakai data mobil) ---
            //ambil data suhu ECU dari telemetry
            if (telemetryRef.current && telemetryRef.current.channels[channelName]) {
                const channelData = telemetryRef.current.channels[channelName];
                if (channelData.length > 0) {
                    setCurrentTemp(channelData[channelData.length - 1]);
                }
            }
            
            //ambil data Vbatt dari telemetry
            if (telemetryRef.current && telemetryRef.current.channels["BMS_V"]) {
                const vChannelData = telemetryRef.current.channels["BMS_V"];
                if (vChannelData.length >0) {
                    setVbatt(vChannelData[vChannelData.length - 1]);
                }
            */

            rafRef.current = requestAnimationFrame(renderFrame);
        };

        rafRef.current = requestAnimationFrame(renderFrame);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [telemetryRef, channelName]);

    // Asumsi batas suhu maksimal ECU adalah 100 derajat Celcius
    const maxTemp = 100;
    const safeTemp = Math.min(Math.max(currentTemp, 0), maxTemp);

    // Kalkulasi persentase (0.0 sampai 1.0)
    const fillPercentage = safeTemp / maxTemp;

    // --- RUMUS SLIDING WINDOW MASK ---
    // Tentukan berapa persen tinggi gambar yang mau diperlihatkan (misal 25%)
    const windowHeight = 3;

    // Posisi Y meluncur berdasarkan suhu:
    // Suhu 0 -> Jendela di bawah. Suhu 100 -> Jendela di atas.
    const yPositionValue = 0 + (1 - fillPercentage) * (100 - windowHeight);

    const yPosition = `${yPositionValue}%`;
    const rectHeight = `${windowHeight}%`;

    return (
        // Wrapper transparan, diposisikan tumpang tindih dengan komponen lain
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 4, pointerEvents: 'none' }}>

            <svg
                width="100%" height="100%"
                style={{
                    position: 'absolute',
                    top: 148,
                    left: -128,
                    width: '56%',
                    height: '56%',
                    filter: 'drop-shadow(0px 0px 8px rgba(255, 234, 0, 0.4))' // Glow kuning tipis
                }}
            >
                <defs>
                    <clipPath id="ecuTempClipPath">
                        <rect
                            x="0"
                            y={yPosition}
                            width="100%"
                            height={rectHeight}
                        />
                    </clipPath>
                </defs>

                {/* Gambar bar melengkung dipotong oleh jendela sliding */}
                <image
                    href={ecuTempBar}
                    x="0" y="0"
                    width="100%" height="100%"
                    clipPath="url(#ecuTempClipPath)"
                />
            </svg>

            {/* Angka suhu ECU */}
            <h1 style={{
                position: 'absolute',
                top: 110,
                left: -95,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#ffffff',
            }}>
                {currentTemp.toFixed(0)}°C
            </h1>

            {/* Angka Vbatt */}
            <h1 style={{
                position: 'absolute',
                top: 250,
                right: 450,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#ffffff',
            }}>
                {currentVbatt.toFixed(1)}
            </h1>

        </div>
    );
};

export default EcuGauge;