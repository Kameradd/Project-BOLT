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

export const mapValuesToTelemetry = (values) => {
  const mapped = {};
  for (let index = 0; index < TELEMETRY_FIELDS.length; index += 1) {
    const field = TELEMETRY_FIELDS[index];
    mapped[field] = values[index] ?? null;
  }
  return mapped;
};
