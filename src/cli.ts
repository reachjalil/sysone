#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createClient } from "./client.js";
import { launchApp } from "./launcher.js";
import { startMcp } from "./mcp.js";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    connection: { type: "string" },
    home: { type: "string" },
    port: { type: "string" },
    "no-open": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
try {
  const command = positionals[0] ?? "app";
  if (values.help || command === "help")
    console.log(`System One — your agent's decision center

  npx sysone                 Start the app and open Studio
  sysone app --no-open       Start without opening a browser
  sysone status [--connection /private/path/agent.json]
  sysone mcp [--connection /private/path/agent.json]

App options: --port 4319 --home /private/path
The open-source launcher downloads a checksum-verified application runtime.
The engine starts locally; add your Vercel Gateway key in Studio settings.
The application runtime has a separate preview license; its source is private.
MCP/status use SYSONE_URL and SYSONE_TOKEN, or a scoped connection file.
Default connection: ~/.config/systemoneengine/agent.json
Documentation: https://systemoneengine.com/docs/`);
  else if (command === "app" || command === "studio")
    await launchApp({
      port: values.port,
      home: values.home,
      noOpen: values["no-open"],
    });
  else {
    const raw: unknown = values.connection
      ? JSON.parse(readFileSync(resolve(values.connection), "utf8"))
      : process.env.SYSONE_URL && process.env.SYSONE_TOKEN
        ? { url: process.env.SYSONE_URL, token: process.env.SYSONE_TOKEN }
        : JSON.parse(
            readFileSync(
              join(homedir(), ".config", "systemoneengine", "agent.json"),
              "utf8",
            ),
          );
    if (
      !raw ||
      typeof raw !== "object" ||
      !("url" in raw) ||
      typeof raw.url !== "string" ||
      !("token" in raw) ||
      typeof raw.token !== "string"
    )
      throw Error("Invalid connection");
    const connection = { url: raw.url, token: raw.token };
    if (command === "mcp") await startMcp(connection);
    else if (command === "status")
      console.log(
        JSON.stringify(await createClient(connection).capabilities(), null, 2),
      );
    else throw Error("Unknown command");
  }
} catch {
  console.error(
    "System One could not complete the command. Check your network, Node version (22.18+), selected port or scoped connection. Use sysone --help.",
  );
  process.exitCode = 1;
}
