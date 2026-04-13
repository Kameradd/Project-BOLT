const { spawn } = require("node:child_process");

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isWindows = process.platform === "win32";
const phase1VerifySeconds = toNumber(process.env.PHASE1_VERIFY_SECONDS, 5);
const comPort = process.env.COM_PORT;
const baudRate = process.env.BAUD_RATE || "115200";

if (!comPort) {
  console.error("[HW-PREFLIGHT] FAIL: COM_PORT is required (example: COM3)");
  process.exit(1);
}

const steps = [
  {
    label: "List serial ports",
    commandLine: "npm run phase1:ports -w backend",
    env: {}
  },
  {
    label: "Phase1 verify (hardware)",
    commandLine: "npm run phase1:verify:hw -w backend",
    env: {
      MOCK_SERIAL: "false",
      COM_PORT: comPort,
      BAUD_RATE: String(baudRate),
      PHASE1_VERIFY_SECONDS: String(phase1VerifySeconds)
    }
  },
  {
    label: "Frontend build",
    commandLine: "npm run build -w frontend",
    env: {}
  }
];

const getShellInvocation = (commandLine) => {
  if (isWindows) {
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", commandLine]
    };
  }

  return {
    command: "sh",
    args: ["-lc", commandLine]
  };
};

const runStep = (step, index) =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    console.log(`\n[HW-PREFLIGHT] (${index + 1}/${steps.length}) ${step.label}`);

    const shellInvocation = getShellInvocation(step.commandLine);

    const child = spawn(shellInvocation.command, shellInvocation.args, {
      cwd: process.cwd(),
      env: { ...process.env, ...step.env },
      stdio: "inherit"
    });

    child.on("error", (error) => {
      reject(new Error(`${step.label} failed to start: ${error.message}`));
    });

    child.on("close", (code) => {
      const elapsed = ((Date.now() - start) / 1000).toFixed(2);
      if (code === 0) {
        console.log(`[HW-PREFLIGHT] PASS ${step.label} (${elapsed}s)`);
        resolve();
        return;
      }

      reject(new Error(`${step.label} exited with code ${code}`));
    });
  });

const run = async () => {
  console.log("[HW-PREFLIGHT] Starting hardware preflight");
  console.log(
    `[HW-PREFLIGHT] Config COM_PORT=${comPort} BAUD_RATE=${baudRate} PHASE1_VERIFY_SECONDS=${phase1VerifySeconds}`
  );

  for (let index = 0; index < steps.length; index += 1) {
    await runStep(steps[index], index);
  }

  console.log("\n[HW-PREFLIGHT] PASS: Hardware pre-session checks completed successfully.");
};

run().catch((error) => {
  console.error(`\n[HW-PREFLIGHT] FAIL: ${error.message}`);
  process.exit(1);
});
