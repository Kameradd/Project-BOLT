import React, { useEffect, useState, useRef } from "react";

const TimeStamp = ({ telemetryRef, channelName = "TimeSampling" }) => { // 1. Sesuaikan nama channel bawaannya
    const [currentTime, setCurrentTime] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        const renderFrame = () => {
            if (telemetryRef.current) {
                // Try to get time from x array (CSV import stores timestamps in ms as x array values)
                if (telemetryRef.current.x && telemetryRef.current.x.length > 0) {
                    const timeInSeconds = telemetryRef.current.x[telemetryRef.current.x.length - 1];
                    setCurrentTime(timeInSeconds);
                }
                // Fallback to channel lookup for backend live data
                else if (telemetryRef.current.channels[channelName]) {
                    const timeData = telemetryRef.current.channels[channelName];
                    if (timeData.length > 0) setCurrentTime(timeData[timeData.length - 1]);
                }
            }

            // 2. KUNCI PERBAIKAN: Panggil lagi di sini agar loop-nya tidak putus!
            rafRef.current = requestAnimationFrame(renderFrame);
        };

        // Panggilan pertama (trigger awal)
        rafRef.current = requestAnimationFrame(renderFrame);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [telemetryRef, channelName]);

    // 3. (Opsional) Mengubah angka Epoch menjadi format Jam yang rapi (HH:MM:SS)
    // Karena epoch dari ESP32 dalam hitungan detik, kita kali 1000 untuk mengubahnya ke milidetik (standar Javascript)
    const formattedTime = currentTime > 0
        ? new Date(currentTime * 1000).toLocaleTimeString("id-ID")
        : "WAITING...";

    return (
        <div style={{ color: '#e5e7eb', fontFamily: "'Orbitron', sans-serif" }}>
            <p style={{ margin: 0 }}>TIME: <span style={{ color: '#22d3ee', fontWeight: 'bold' }}>{formattedTime}</span></p>
            {/* Kalau tetap mau nampilin angka aslinya, buka komen di bawah ini: */}
            {/* <p style={{ fontSize: '10px', color: '#9ca3af' }}>Raw Epoch: {currentTime}</p> */}
        </div>
    );
};

export default TimeStamp;