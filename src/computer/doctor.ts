import { createServer } from "node:http";
import { BrowserSession } from "./session.js";
import { chromePath } from "./browser-path.js";
import { desktopDoctor } from "./desktop.js";
export async function computerDoctor(
  options: { desktop?: boolean; executablePath?: string } = {},
) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  const nodeReady = major > 22 || (major === 22 && minor >= 18);
  const executablePath = chromePath(options.executablePath);
  const checks: { check: string; status: string; detail: string }[] = [
    {
      check: "node",
      status: nodeReady ? "ready" : "missing",
      detail: `Node ${process.versions.node}; requires 22.18 or newer.`,
    },
    {
      check: "browser",
      status: executablePath ? "found" : "missing",
      detail:
        executablePath ??
        "Install Google Chrome or Chromium, or set SYSONE_CHROME_PATH to its executable. No browser download is automatic.",
    },
  ];
  let browserReady = false;
  if (nodeReady && executablePath) {
    const http = createServer((_req, res) => {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><title>System One setup check</title><button aria-label="Setup probe">Probe</button>',
      );
    });
    const session = new BrowserSession({ headless: true, executablePath });
    try {
      await new Promise<void>((resolve, reject) => {
        http.once("error", reject);
        http.listen(0, "127.0.0.1", resolve);
      });
      const address = http.address();
      if (!address || typeof address === "string") throw Error("loopback");
      await session.start(`http://127.0.0.1:${address.port}`);
      const observation = await session.observe(true);
      browserReady =
        observation.screen.accessibility.status === "available" &&
        observation.screen.controls[0]?.name === "Setup probe" &&
        !!observation.image;
      checks.push({
        check: "isolated-browser-probe",
        status: browserReady ? "ready" : "degraded",
        detail: browserReady
          ? "Temporary profile, Chrome accessibility API, DOM binding and screenshot succeeded on a local test page."
          : "The browser launched, but computed accessibility or screenshots were unavailable. Use a current Chrome/Chromium build.",
      });
    } catch {
      checks.push({
        check: "isolated-browser-probe",
        status: "failed",
        detail:
          "Could not launch or observe the local test page. Check SYSONE_CHROME_PATH, executable permissions, writable temporary storage, loopback access and OS browser dependencies. Do not disable the browser sandbox.",
      });
    } finally {
      await session.close().catch(() => {});
      await new Promise<void>((resolve) => http.close(() => resolve()));
    }
  }
  return {
    browserReady,
    checks,
    providerCalls: 0,
    connection:
      "Not checked. Decide/run additionally require a scoped System One connection with the decide service and network access. Doctor needs no token or provider key.",
    browserPermissions:
      "No macOS Accessibility or Screen Recording permission is needed for the dedicated Chrome session. Its temporary profile is separate from your regular browser.",
    ...(options.desktop
      ? { desktop: await desktopDoctor() }
      : {
          desktop: {
            status: "not_enabled",
            next: "Optional: sysone computer doctor --desktop checks the read-only Mac AX helper. Enable its MCP observation tool with --desktop.",
          },
        }),
  };
}
