# Project-BOLT

Mission-aligned baseline for a trackside telemetry dashboard:
- Windows serial ingest from LoRa receiver (`COMx` via USB-to-Serial)
- Local WebSocket router (`ws://localhost:8787`)
- React + uPlot visualization with mutable data buffer (no high-frequency React state writes)

## Current Phase Coverage

- Phase 1: Serial monitor script available and validated with mock 10Hz stream
- Phase 2: Payload parser for signed 16-bit values from hex words implemented
- Phase 3: WebSocket server broadcasts parsed telemetry to local clients (automated verifier available)
- Phase 4: Vite + React shell with static/live uPlot rendering

## Workspace Layout

- `backend/`: Serial source, parser, and WebSocket server
- `frontend/`: Vite + React UI with uPlot chart

## Quick Start (Windows PowerShell)

1. Install dependencies:

```powershell
npm install
```

2. Optional: create backend environment file from example:

```powershell
Copy-Item .\backend\.env.example .\backend\.env
```

3. Run backend in real serial mode:

```powershell
$env:COM_PORT='COM3'
$env:BAUD_RATE='115200'
npm run dev:backend
```

4. Run backend in mock mode (hardware-free test):

```powershell
$env:MOCK_SERIAL='true'
npm run dev:backend
```

5. Verify Phase 3 router broadcast (automated local WS check):

```powershell
npm run phase3 -w backend
```

6. Run backend soak verification (endurance-style counters + throughput):

```powershell
$env:SOAK_SECONDS='60'
npm run phase5:soak -w backend
```

7. Run frontend:

```powershell
npm run dev:frontend
```

Optional channel selection (frontend):

```powershell
$env:VITE_TELEMETRY_CHANNEL='ECU_RPM'
npm run dev:frontend
```

Open the frontend URL shown by Vite (typically `http://localhost:5173`).

## One-Command Preflight

Run the complete pre-session check pipeline:

```powershell
npm run preflight
```

The preflight executes, in order:
- `phase1:verify` (finite serial ingest check, mock mode)
- `phase3` (router broadcast verification)
- `phase5:soak` (throughput + integrity counters)
- `frontend build`

Optional tuning:
- `PREFLIGHT_PHASE1_SECONDS` (default: `3`)
- `PREFLIGHT_SOAK_SECONDS` (default: `12`)

## Hardware Commissioning (Windows)

1. Discover receiver COM port:

```powershell
npm run phase1:ports -w backend
```

2. Run hardware preflight (real serial input, no mock):

```powershell
$env:COM_PORT='COM3'
$env:BAUD_RATE='115200'
$env:PHASE1_VERIFY_SECONDS='5'
npm run preflight:hw
```

3. Optional: Transmit dummy telemetry into a real COM port (TX tool):

```powershell
npm run phase1:com-mock -w backend -- --port COM5 --baud 115200 --hz 10 --words 40
```

Optional finite run:

```powershell
npm run phase1:com-mock -w backend -- --port COM5 --seconds 30
```

Realistic race-like waveform example:

```powershell
npm run phase1:com-mock -w backend -- --port COM5 --profile race --wave triangle --noise 18 --drift 2 --spike-rate 0.003 --dropout-rate 0.01
```

Profile/variation options:
- `--profile <legacy|smooth|race|step>`: signal behavior template (`legacy` preserves old deterministic shape)
- `--wave <sine|triangle|square|saw>`: primary waveform form used by dynamic channels
- `--noise <number>`: random noise amplitude added per channel sample
- `--drift <number>`: random walk drift amplitude per frame
- `--spike-rate <0-1>`: transient spike probability per channel sample
- `--dropout-rate <0-1>`: per-frame drop probability to simulate missing RF packets
- `--seed <number>`: deterministic run seed for repeatable replay

Hardware preflight executes:
- serial port discovery
- finite Phase 1 hardware ingest verification
- frontend build check

Notes:
- `preflight:hw` requires `COM_PORT`.
- Ensure LoRa receiver is connected and transmitting 10Hz payload lines matching `TELEMETRY_WORDS`.
- For `phase1:com-mock`, use a writable serial endpoint (USB-Serial TX, loopback adapter, or virtual COM pair).
- If you get `Access denied`, another process is likely already using that COM port.
- If `phase1:ports` shows no ports, reconnect the adapter/device and verify Windows Device Manager detects it.
- Do not run writer and reader on the same COM endpoint at once; use paired ports for injection testing.

## Payload Contract (Current Draft)

- Incoming line-based payload is expected as hex string (no separators required)
- Every 4 hex chars represent one signed 16-bit value (big-endian)
- Runtime enforcement is controlled by `TELEMETRY_WORDS` (default `40` from mission schema), so payload length must be exactly `TELEMETRY_WORDS * 4` hex chars
- Backend now publishes both `values` (ordered array) and `channels` (field-name map) for each telemetry frame

### Mission Schema (40 signed int16 words)

- `Timestamp`, `SystemOK`, `DataValidity`, `CAN2RxCount`, `BMS_V`, `BMS_A`, `BMS_SOC`, `BMS_RemCap`, `BMS_Temp_Max`
- `ECU_Temp`, `ECU_V`, `ECU_RPM`, `Gear`, `Throttle`, `GPS_Speed`
- `Brake_Raw`, `Susp1_Raw`, `Susp2_Raw`, `Susp3_Raw`, `Susp4_Raw`
- `IMU_Ax`, `IMU_Ay`, `IMU_Az`, `IMU_Gx`, `IMU_Gy`, `IMU_Gz`
- `Steer_Raw`, `Steer_Norm`
- `RPM_PA15`, `RPM_PB3`, `RPM_PB5`, `RPM_PB8`
- `VESC_L`, `VESC_R`, `APPS1`, `APPS2`, `Pedal`, `Duty`, `Motor_L`, `Motor_R`

### Backend Config Keys

- `COM_PORT`: Serial receiver COM port (example: `COM3`)
- `BAUD_RATE`: Serial line baud rate (example: `115200`)
- `WS_PORT`: Local WebSocket server port (default: `8787`)
- `TELEMETRY_WORDS`: Exact number of signed 16-bit words expected per payload line
- `MOCK_SERIAL`: Enable synthetic 10Hz data stream (`true` / `false`)

### Frontend Config Key

- `VITE_TELEMETRY_CHANNEL`: Channel name to plot from mission schema (default: `ECU_RPM`)

## Notes

- This baseline intentionally prioritizes non-blocking telemetry flow and render stability.
- `uPlot` data updates are driven from mutable refs with `requestAnimationFrame`.
- Frontend runtime emits `[BOLT PERF]` logs (about every 5 seconds) with FPS and heap trend when browser memory API is available.

## Phase 5 Runtime Check (Manual)

1. Start backend in mock mode:

```powershell
$env:MOCK_SERIAL='true'
npm run dev:backend
```

2. Start frontend:

```powershell
npm run dev:frontend
```

3. Open app in browser and monitor DevTools console for `[BOLT PERF]`.

Expected signals for a healthy baseline:
- FPS current/average remains close to 60.
- FPS min does not repeatedly collapse under sustained 10Hz telemetry.
- Heap delta trend stays relatively flat over time (no unbounded growth pattern).

## Backend Soak Pass Criteria

- `drop=0`
- `error=0`
- `parseError=0`
- `invalidShape=0`
- `telemetryHz >= 7.5` (75% of 10Hz target baseline)
