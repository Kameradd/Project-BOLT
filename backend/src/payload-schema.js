export const TELEMETRY_FIELDS = [
  "Timestamp",
  "SystemOK",
  "DataValidity",
  "CAN2RxCount",
  "BMS_V",
  "BMS_A",
  "BMS_SOC",
  "BMS_RemCap",
  "BMS_Temp_Max",
  "ECU_Temp",
  "ECU_V",
  "ECU_RPM",
  "Gear",
  "Throttle",
  "GPS_Speed",
  "Brake_Raw",
  "Susp1_Raw",
  "Susp2_Raw",
  "Susp3_Raw",
  "Susp4_Raw",
  "IMU_Ax",
  "IMU_Ay",
  "IMU_Az",
  "IMU_Gx",
  "IMU_Gy",
  "IMU_Gz",
  "Steer_Raw",
  "Steer_Norm",
  "RPM_PA15",
  "RPM_PB3",
  "RPM_PB5",
  "RPM_PB8",
  "VESC_L",
  "VESC_R",
  "APPS1",
  "APPS2",
  "Pedal",
  "Duty",
  "Motor_L",
  "Motor_R"
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
