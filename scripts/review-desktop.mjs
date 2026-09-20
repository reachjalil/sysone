// Manual native integration check. Opens only our own fixture application.
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import assert from "node:assert/strict";
import { desktopDoctor, observeDesktop } from "../dist/computer/index.js";
const exec = promisify(execFile);
if (process.platform !== "darwin")
  throw Error("This manual check requires macOS.");
const doctor = await desktopDoctor();
if (doctor.accessibility !== "granted")
  throw Error(
    "Accessibility is not granted; native fixture read remains unverified.",
  );
const folder = await mkdtemp(join(tmpdir(), "sysone-ax-test-"));
let processHandle, fixturePid;
try {
  const contents = join(folder, "Fixture.app", "Contents");
  await mkdir(join(contents, "MacOS"), { recursive: true });
  await writeFile(
    join(contents, "Info.plist"),
    `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>com.systemoneengine.accessibility-fixture</string><key>CFBundleExecutable</key><string>fixture</string><key>CFBundleName</key><string>System One AX Fixture</string><key>CFBundlePackageType</key><string>APPL</string><key>LSUIElement</key><true/></dict></plist>`,
  );
  const binary = join(contents, "MacOS", "fixture");
  await exec(
    "/usr/bin/xcrun",
    ["swiftc", "test/fixtures/ax-fixture.swift", "-o", binary],
    { timeout: 45000 },
  );
  processHandle = spawn(
    "/usr/bin/open",
    ["-W", "-n", join(folder, "Fixture.app")],
    { stdio: "ignore" },
  );
  await new Promise((r) => setTimeout(r, 1000));
  const observation = await observeDesktop(
    "com.systemoneengine.accessibility-fixture",
  );
  fixturePid = observation.pid;
  const output = process.argv[2] || join(folder, "evidence.json");
  await writeFile(
    resolve(output),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        type: "first-party native adapter integration check",
        passed: false,
        platform: process.platform,
        permission: doctor.accessibility,
        observation,
        limitation:
          "A usable focused window and controls have not been established by this attempt.",
      },
      null,
      2,
    ) + "\n",
  );
  assert.ok(!observation.error, JSON.stringify(observation));
  assert.ok(
    observation.nodes.some(
      (n) =>
        n.name === "Save preview" && n.availableActions.includes("AXPress"),
    ),
  );
  assert.ok(observation.nodes.some((n) => n.value === "Aurora"));
  assert.ok(
    !JSON.stringify(observation).includes("never-export-native-secret"),
  );
  assert.equal(observation.readOnly, true);
  assert.ok(observation.nodes.some((n) => n.bounds?.width > 0));
  assert.equal(
    (await observeDesktop("com.systemoneengine.not-running-fixture")).error,
    "application_not_running_or_ambiguous",
  );
  const evidence = {
    passed: true,
    at: new Date().toISOString(),
    type: "first-party native adapter integration check",
    platform: process.platform,
    node: process.version,
    scopedBundleId: observation.bundleId,
    checks: [
      "Read only the temporary owned AppKit fixture",
      "Observed Save preview with AXPress capability",
      "Observed Aurora field value and bounds",
      "Secure text value omitted",
      "Unavailable application returned explicit error",
      "No desktop input events posted",
    ],
    observation,
  };
  await writeFile(resolve(output), JSON.stringify(evidence, null, 2) + "\n");
  console.log(
    JSON.stringify({
      passed: true,
      nodes: observation.nodes.length,
      truncated: observation.truncated,
      output,
    }),
  );
} finally {
  if (fixturePid) {
    try {
      process.kill(fixturePid);
    } catch {}
  }
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill();
    await new Promise((r) => processHandle.once("exit", r));
  }
  await rm(folder, { recursive: true, force: true });
}
