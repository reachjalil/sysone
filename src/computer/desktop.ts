import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, mkdir, chmod, rename, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile);
let preparation: Promise<string> | undefined;
async function prepare() {
  if (process.platform !== "darwin")
    throw Error(
      "Native accessibility observation is available on macOS only. Use the dedicated browser on other platforms.",
    );
  const source = fileURLToPath(
    new URL("../../native/ax.swift", import.meta.url),
  );
  const hash = createHash("sha256")
    .update(await readFile(source))
    .digest("hex")
    .slice(0, 16);
  const folder = join(
    homedir(),
    "Library",
    "Caches",
    "SystemOne",
    "helpers",
    hash,
  );
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const binary = join(folder, "sysone-ax");
  try {
    await readFile(binary);
    return binary;
  } catch {}
  const temp = `${binary}.${process.pid}.tmp`;
  try {
    await execute("/usr/bin/xcrun", ["swiftc", "-O", source, "-o", temp], {
      timeout: 45_000,
      maxBuffer: 1024 * 1024,
    });
    await chmod(temp, 0o700);
    await rename(temp, binary);
  } catch {
    throw Error(
      "The Mac accessibility helper could not compile. Install Apple Command Line Tools with xcode-select --install, then run sysone computer doctor --desktop again.",
    );
  } finally {
    await rm(temp, { force: true });
  }
  return binary;
}
async function helper() {
  if (!preparation)
    preparation = prepare().catch((error) => {
      preparation = undefined;
      throw error;
    });
  return preparation;
}
export async function desktopDoctor() {
  if (process.platform !== "darwin")
    return {
      platform: process.platform,
      status: "unsupported",
      next: "Native AX observation requires macOS. Dedicated browser observation is independent.",
    };
  try {
    const binary = await helper();
    const { stdout } = await execute(binary, ["doctor"], {
      timeout: 6000,
      maxBuffer: 8192,
    });
    return {
      ...JSON.parse(stdout),
      helper: binary,
      next: "AX reading needs Accessibility permission for the responsible launching host or helper. Run this check from the same host that launches MCP. No permission prompt is opened. Screen Recording is informational and is not required by this AX-only adapter.",
    };
  } catch (error) {
    return {
      platform: "macos",
      status: "unavailable",
      next:
        error instanceof Error
          ? error.message
          : "Check Apple Command Line Tools.",
    };
  }
}
export async function observeDesktop(bundleId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9.-]{1,199}$/.test(bundleId))
    throw Error(
      "Supply the exact macOS application bundle ID, for example com.apple.TextEdit.",
    );
  const binary = await helper();
  const { stdout } = await execute(binary, ["observe", bundleId], {
    timeout: 6000,
    maxBuffer: 128 * 1024,
  });
  return JSON.parse(stdout) as Record<string, unknown>;
}
