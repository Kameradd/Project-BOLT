export const TELEMETRY_FIELDS = [
  "TimeSampling",
  "bmsVolts",
  "bmsTemp",
  "bmsCurrent",
  "bmsSOC",
  "engineTemp",
  "ECUBattV",
  "speed",
  "RPM",
  "throttle",
  "steering",
  "HyStatus",
  "Gear",
  "RawBrake",
  "imuAx",
  "imuAy",
  "imuAz",
  "imuGx",
  "imuGy",
  "imuGz",
  "susp1Raw",
  "susp2Raw",
  "susp3Raw",
  "susp4Raw",
  "rpmPa15",
  "rpmPb3",
  "rpmPb5",
  "rpmPb8",
  "vescRpmLeft",
  "vescRpmRight",
  "apps1",
  "apps2",
  "pedal",
  "duty",
  "leftMotor",
  "rightMotor"
];

export const TELEMETRY_WORD_COUNT = TELEMETRY_FIELDS.length;

// Scaling factors for decoding (divide raw value by this to get actual value)
// Based on ESP32 encoding: e.g., bmsVolts raw 7200 = 720.0V, so divisor is 10
export const TELEMETRY_SCALERS = {
  TimeSampling: 1,
  bmsVolts: 1,
  bmsTemp: 1,
  bmsCurrent: 1,
  bmsSOC: 1,
  engineTemp: 1,
  ECUBattV: 1,
  speed: 1,
  RPM: 1,
  throttle: 1,
  steering: 1,
  HyStatus: 1,
  Gear: 1,
  RawBrake: 1,
  imuAx: 1,
  imuAy: 1,
  imuAz: 1,
  imuGx: 1,
  imuGy: 1,
  imuGz: 1,
  susp1Raw: 1,
  susp2Raw: 1,
  susp3Raw: 1,
  susp4Raw: 1,
  rpmPa15: 1,
  rpmPb3: 1,
  rpmPb5: 1,
  rpmPb8: 1,
  vescRpmLeft: 1,
  vescRpmRight: 1,
  apps1: 1,
  apps2: 1,
  pedal: 1,
  duty: 1,
  leftMotor: 1,
  rightMotor: 1
};

export const mapValuesToTelemetry = (values) => {
  const mapped = {};
  for (let index = 0; index < TELEMETRY_FIELDS.length; index += 1) {
    const field = TELEMETRY_FIELDS[index];
    mapped[field] = values[index] ?? null;
  }
  return mapped;
};
