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
  "imuGz"
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
