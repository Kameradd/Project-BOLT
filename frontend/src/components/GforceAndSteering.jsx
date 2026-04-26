import React, { useEffect, useState, useRef } from "react";
// Ganti path import di bawah dengan lokasi file dot merah aslimu
import redDotSvg from "../assets/reddot.svg";
import SteeringPointer from "../assets/steeringPointer.svg";
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const GforceAndSteering = ({
    telemetryRef,
    channelNameimuAx = "imuAx",
    channelNameimuAy = "imuAy",
    channelNameSteering = "Steering_Angle"
}) => {
    const [currentimuAx, setCurrentimuAx] = React.useState(0);
    const [currentimuAy, setCurrentimuAy] = React.useState(0);
    const [currentSteering, setCurrentSteering] = React.useState(0);
    const rafRef = React.useRef(null);

    React.useEffect(() => {
        let angle = 0;
        let Yangle = 0;

        const renderFrame = () => {
            //==========================================================
            /*
            //mode simulasi
            const simulatedimuAx = Math.sin(angle) * 3; // Simulasi -3g sampai 3g
            const simulatedimuAy = Math.cos(Yangle) * 3; // Simulasi -3g sampai 3g
            const simulatedSteering = Math.sin(angle * 0.5) * 450; // Simulasi -450° sampai 450°
            setCurrentimuAx(simulatedimuAx);
            setCurrentimuAy(simulatedimuAy);
            setCurrentSteering(simulatedSteering);
            Yangle += 0.1;
            angle += 0.1;
            */

            //mode rill
            if (telemetryRef.current) {
                // Ambil data imuAx
                if (telemetryRef.current.channels[channelNameimuAx]) {
                    const axData = telemetryRef.current.channels[channelNameimuAx];
                    if (axData.length > 0) setCurrentimuAx(axData[axData.length - 1]);
                }

                // Ambil data imuAy
                if (telemetryRef.current.channels[channelNameimuAy]) {
                    const ayData = telemetryRef.current.channels[channelNameimuAy];
                    if (ayData.length > 0) setCurrentimuAy(ayData[ayData.length - 1]);
                }

                // Ambil data Steering Angle
                if (telemetryRef.current.channels[channelNameSteering]) {
                    const steeringData = telemetryRef.current.channels[channelNameSteering];
                    if (steeringData.length > 0) setCurrentSteering(steeringData[steeringData.length - 1]);
                }
            }

            rafRef.current = requestAnimationFrame(renderFrame);
        };

        rafRef.current = requestAnimationFrame(renderFrame);
        return () => {
            if (rafRef.current) {
                cancelAnimationFrame(rafRef.current);
            }
        };
    }, [telemetryRef, channelNameimuAx, channelNameimuAy, channelNameSteering]);

    //kalkulasi posisi titik merah
    const maxGforce = 3;
    // Normalisasi nilai (-1.0 sampai 1.0)
    const normalizedAx = clamp(currentimuAx, -maxGforce, maxGforce) / maxGforce;
    const normalizedAy = clamp(currentimuAy, -maxGforce, maxGforce) / maxGforce;
    const circleRadiusPx = 35; // Radius lingkaran dalam piksel

    // Posisi X dan Y untuk titik merah
    const translateX = normalizedAx * circleRadiusPx;
    const translateY = -normalizedAy * circleRadiusPx;

    // Kalkulasi pergerakan steering pointer (geser kiri-kanan)
    const maxSteeringDeg = 450;
    const pointerTravelPx = 180; // Total jarak pointer bergerak dari kiri ke kanan dalam piksel
    const normalizedSteering = clamp(currentSteering, -maxSteeringDeg, maxSteeringDeg) / maxSteeringDeg;
    const steeringTranslateX = normalizedSteering * pointerTravelPx;



    return (
        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none' }}>

            {/* WADAH UTAMA G-FORCE */}
            <div style={{
                position: 'absolute',
                // 👇 SESUAIKAN TOP DAN LEFT INI AGAR TITIK TENGAH WADAH INI PERSIS BERADA DI TENGAH LINGKARAN PUTIH FIGMA-MU
                top: 247,
                left: 470,
                width: 0,
                height: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                overflow: 'visible'
            }}>

                {/* TITIK MERAH YANG BERGERAK */}
                <img
                    src={redDotSvg}
                    alt="G-Force Dot"
                    style={{
                        position: 'absolute',
                        width: '12px',  // Sesuaikan ukuran titik merah
                        height: '12px',
                        // Titik akan bergerak dari pusat (Wadah) sejauh translateX dan translateY
                        transform: `translate(${translateX}px, ${translateY}px)`,
                        // Transisi CSS tidak perlu ditambahkan karena requestAnimationFrame sudah sangat halus
                        filter: 'drop-shadow(0px 0px 4px rgba(255, 0, 0, 0.8))' // Efek glow
                    }}
                />

                {/* --- OPSIONAL: ANGKA G-FORCE DI BAWAH LINGKARAN --- */}
                <h1 style={{
                    position: 'absolute',
                    top: 50, // Jarak dari titik pusat ke bawah lingkaran
                    fontFamily: "'Orbitron', sans-serif",
                    fontSize: '16px',
                    color: '#ffffff',
                    whiteSpace: 'nowrap'
                }}>
                    {(Math.sqrt(currentimuAx ** 2 + currentimuAy ** 2)).toPrecision(2)} G
                </h1>

            </div>

            {/* --- CONTOH MENAMPILKAN STEERING ANGLE --- */}

            <h1 style={{
                position: 'absolute',
                top: 300,
                left: -100,
                fontFamily: "'Orbitron', sans-serif",
                fontSize: '14px',
                color: '#ffffff'
            }}>
                {Math.round(currentSteering)}°
            </h1>

            {/* STEERING POINTER GESER KIRI-KANAN */}
            <div style={{
                position: 'absolute',
                top: 310,
                left: 78.5,
                width: 260,
                height: 15,
                overflow: 'visible'
            }}>
                <img
                    src={SteeringPointer}
                    alt="Steering Pointer"
                    style={{
                        position: 'absolute',
                        width: '100px',
                        height: '15px',
                        transform: `translateX(${steeringTranslateX + 30}px)`,
                        //filter: 'drop-shadow(0px 0px 5px rgba(34, 211, 238, 0.8))'
                    }}
                />
            </div>

        </div>
    );
};

export default GforceAndSteering;