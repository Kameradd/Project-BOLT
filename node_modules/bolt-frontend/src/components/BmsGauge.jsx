import React, { useEffect, useState, useRef } from 'react';
// Pastikan file soc-bms.svg sudah ada di folder assets
import socBar from '../assets/soc-bms.svg';

// Tambahkan props untuk channel baru
const BmsGauge = ({
    telemetryRef,
    channelName = "BMS_SOC",
    voltageChannel = "BMS_V",
    currentChannel = "BMS_A",
    tempChannel = "BMS_Temp_Max"
}) => {
    // State untuk menampung data
    const [currentSoc, setCurrentSoc] = useState(0);
    const [bmsVoltage, setBmsVoltage] = useState(0);
    const [bmsCurrent, setBmsCurrent] = useState(0);
    const [bmsTemp, setBmsTemp] = useState(0);

    const rafRef = useRef(null);

    useEffect(() => {
        let angle = 0; // Untuk simulasi naik turun baterai

        const renderFrame = () => {

            // --- MODE SIMULASI UNTUK TESTING ---
            const simulatedSoc = (1 - Math.abs((angle % 2) - 1)) * 100;
            const simulatedVoltage = 500 + Math.sin(angle * 10) * 40; // Simulasi 460V - 540V
            const simulatedCurrent = Math.sin(angle * 20) * 90;      // Simulasi -100A (Regen) sampai 100A
            const simulatedTemp = 40 + Math.abs(Math.sin(angle * 5)) * 30; // Simulasi 40°C - 70°C

            setCurrentSoc(simulatedSoc);
            setBmsVoltage(simulatedVoltage);
            setBmsCurrent(simulatedCurrent);
            setBmsTemp(simulatedTemp);

            angle += 0.005; // Kecepatan simulasi

            /*
            // --- MODE RILL MENGGUNAKAN DATA TELEMETRI ---
            // --- KODE ASLI (Buka komen ini saat pakai data mobil) ---
            if (telemetryRef.current) {
                // 1. Ambil SOC
                if (telemetryRef.current.channels[channelName]) {
                    const socData = telemetryRef.current.channels[channelName];
                    if (socData.length > 0) setCurrentSoc(socData[socData.length - 1]);
                }
                
                // 2. Ambil Voltage
                if (telemetryRef.current.channels[voltageChannel]) {
                    const vData = telemetryRef.current.channels[voltageChannel];
                    if (vData.length > 0) setBmsVoltage(vData[vData.length - 1]);
                }

                // 3. Ambil Current
                if (telemetryRef.current.channels[currentChannel]) {
                    const cData = telemetryRef.current.channels[currentChannel];
                    if (cData.length > 0) setBmsCurrent(cData[cData.length - 1]);
                }

                // 4. Ambil Temp
                if (telemetryRef.current.channels[tempChannel]) {
                    const tData = telemetryRef.current.channels[tempChannel];
                    if (tData.length > 0) setBmsTemp(tData[tData.length - 1]);
                }
            }
            */

            rafRef.current = requestAnimationFrame(renderFrame);
        };

        rafRef.current = requestAnimationFrame(renderFrame);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [telemetryRef, channelName, voltageChannel, currentChannel, tempChannel]);

    // Batasi nilai agar tidak error (0 - 100)
    const maxSoc = 100;
    const safeSoc = Math.min(Math.max(currentSoc, 0), maxSoc);

    // Kalkulasi persentase (0.0 sampai 1.0)
    const fillPercentage = safeSoc / maxSoc;

    // RUMUS LINEAR MASKING (Elevator Naik)
    const yPosition = `${100 - (fillPercentage * 100)}%`;
    const rectHeight = `${fillPercentage * 100}%`;

    return (
        // Wrapper transparan, diposisikan tumpang tindih dengan RpmGauge
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 4, pointerEvents: 'none' }}>

            <svg
                width="100%" height="100%"
                style={{
                    position: 'absolute',
                    top: 147,
                    left: 316,
                    width: '38.5%',
                    height: '38.5%',
                    filter: 'drop-shadow(0px 0px 6px rgba(255, 255, 255, 0.4))'
                }}
            >
                <defs>
                    <clipPath id="socClipPath">
                        <rect
                            x="0"
                            y={yPosition}
                            width="100%"
                            height={rectHeight}
                        />
                    </clipPath>
                </defs>

                <image
                    href={socBar}
                    x="0" y="0"
                    width="100%" height="100%"
                    clipPath="url(#socClipPath)"
                />
            </svg>

            {/* --- KUMPULAN ANGKA DIGITAL --- */}

            {/* 1. Angka SOC (Persentase) */}
            <h1 style={{
                position: 'absolute',
                top: 110,
                left: 360,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '16px',
                fontWeight: 'bold',
                color: '#ffffff',
            }}>
                {currentSoc.toPrecision(3)}%
            </h1>

            {/* 2. Angka BMS Voltage (Tegangan) */}
            <h1 style={{
                position: 'absolute',
                top: 30,     /* <--- GESER ANGKA INI UNTUK MENYESUAIKAN POSISI DI FIGMAMU */
                right: -90,    /* <--- GESER ANGKA INI UNTUK MENYESUAIKAN POSISI DI FIGMAMU */
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '20px',
                color: '#ffffff', // Warna Cyan (bisa diubah)
            }}>
                {Math.round(bmsVoltage)}
            </h1>

            {/* 3. Angka BMS Current (Arus) */}
            <h1 style={{
                position: 'absolute',
                top: 0,     /* <--- GESER ANGKA INI UNTUK MENYESUAIKAN POSISI DI FIGMAMU */
                right: -72,    /* <--- GESER ANGKA INI UNTUK MENYESUAIKAN POSISI DI FIGMAMU */
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '20px',
                color: '#ffffff', // Warna Oranye/Kuning (bisa diubah)
            }}>
                {Math.round(bmsCurrent)}
            </h1>

            {/* 4. Angka BMS Temperature (Suhu) */}
            <h1 style={{
                position: 'absolute',
                top: 57,
                right: -106,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '20px',
                color: bmsTemp > 60 ? '#ffff00' : '#ffffff', // Merah jika > 60 derajat, hijau jika aman
            }}>
                {Math.round(bmsTemp)}
            </h1>

        </div>
    );
};

export default BmsGauge;