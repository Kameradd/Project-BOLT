import { SerialPort } from "serialport";

const run = async () => {
  const ports = await SerialPort.list();

  if (ports.length === 0) {
    console.log("[PHASE1] No serial ports detected.");
    return;
  }

  console.log(`[PHASE1] Detected ${ports.length} serial port(s):`);
  for (const port of ports) {
    const details = [
      `path=${port.path}`,
      port.manufacturer ? `manufacturer=${port.manufacturer}` : null,
      port.serialNumber ? `serial=${port.serialNumber}` : null,
      port.vendorId ? `vid=${port.vendorId}` : null,
      port.productId ? `pid=${port.productId}` : null
    ]
      .filter(Boolean)
      .join(" ");

    console.log(`[PHASE1] ${details}`);
  }
};

run().catch((error) => {
  console.error(`[PHASE1] FAIL listing serial ports: ${error.message}`);
  process.exit(1);
});
