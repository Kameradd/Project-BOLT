const { spawn } = require("node:child_process");

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const preflightSoakSeconds = toNumber(process.env.PREFLIGHT_SOAK_SECONDS, 12);
const phase1VerifySeconds = toNumber(process.env.PREFLIGHT_PHASE1_SECONDS, 3);

const isWindows = process.platform === "win32";

const steps = [
  {
    label: "Phase1 verify (mock)",
    commandLine: "npm run phase1:verify -w backend",
    env: {
      MOCK_SERIAL: "true",
      PHASE1_VERIFY_SECONDS: String(phase1VerifySeconds)
    }
  },
  {
    label: "Phase3 router verify",
    commandLine: "npm run phase3 -w backend",
    env: { MOCK_SERIAL: "true" }
  },
  {
    label: "Phase5 backend soak",
    commandLine: "npm run phase5:soak -w backend",
    env: {
      MOCK_SERIAL: "true",
      SOAK_SECONDS: String(preflightSoakSeconds)
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
    console.log(`\n[PRECHECK] (${index + 1}/${steps.length}) ${step.label}`);

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
        console.log(`[PRECHECK] PASS ${step.label} (${elapsed}s)`);
        resolve();
        return;
      }

      reject(new Error(`${step.label} exited with code ${code}`));
    });
  });

const run = async () => {
  console.log("[PRECHECK] Starting Project BOLT preflight");
  console.log(
    `[PRECHECK] Config preflightPhase1Seconds=${phase1VerifySeconds} preflightSoakSeconds=${preflightSoakSeconds}`
  );

  for (let i = 0; i < steps.length; i += 1) {
    await runStep(steps[i], i);
  }

  console.log("\n[PRECHECK] PASS: All pre-session checks completed successfully.");
};

run().catch((error) => {
  console.error(`\n[PRECHECK] FAIL: ${error.message}`);
  process.exit(1);
});
