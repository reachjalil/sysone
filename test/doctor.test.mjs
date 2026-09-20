import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { computerDoctor, observeDesktop } from "../dist/computer/index.js";
import { computerMcpServer } from "../dist/computer/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
const exec = promisify(execFile);
test("setup doctor works without an engine connection and cleans its probe browser", async () => {
  const { stdout } = await exec(
    process.execPath,
    ["dist/cli.js", "computer", "doctor"],
    { env: { ...process.env, SYSONE_URL: "", SYSONE_TOKEN: "" } },
  );
  const report = JSON.parse(stdout);
  assert.equal(report.browserReady, true);
  assert.equal(report.providerCalls, 0);
  assert.equal(report.desktop.status, "not_enabled");
  assert.ok(
    report.checks.some(
      (c) => c.check === "isolated-browser-probe" && c.status === "ready",
    ),
  );
});
test("missing browser has actionable diagnostics without credentials or permission prompts", async () => {
  const report = await computerDoctor({
    executablePath: "/not-an-installed-browser",
  });
  assert.equal(report.browserReady, false);
  assert.match(report.checks.at(-1).detail, /SYSONE_CHROME_PATH/);
  assert.equal(report.providerCalls, 0);
});
test("desktop observation tool requires launch opt-in and exact application scope", async () => {
  for (const desktop of [false, true]) {
    const { server, session } = computerMcpServer(
      { url: "http://127.0.0.1:1", token: "unused" },
      { desktop },
    );
    const client = new Client({ name: "setup-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    try {
      await server.connect(a);
      await client.connect(b);
      const names = (await client.listTools()).tools.map((t) => t.name);
      assert.ok(names.includes("sysone_computer_doctor"));
      assert.equal(names.includes("sysone_desktop_observe"), desktop);
      if (desktop)
        assert.equal(
          (
            await client.callTool({
              name: "sysone_desktop_observe",
              arguments: { bundleId: "../any-app" },
            })
          ).isError,
          true,
        );
    } finally {
      await session.close();
      await client.close();
      await server.close();
    }
  }
  await assert.rejects(
    () => observeDesktop("../any-app"),
    /exact macOS application bundle ID/,
  );
});
