#!/usr/bin/env node
import {
  login,
  logout,
  selectedTarget,
  selectTarget,
  cloudConnection,
  openBrowser,
  cloudOrigin,
} from "./cloud-login.js";
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { createClient } from "./client.js";
import { launchApp } from "./launcher.js";
import { startComputerMcp } from "./computer/mcp.js";
import { computerDoctor } from "./computer/doctor.js";
import { startMcp } from "./mcp.js";
const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    connection: { type: "string" },
    target: { type: "string" },
    home: { type: "string" },
    port: { type: "string" },
    "no-open": { type: "boolean" },
    desktop: { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});
try {
  const command = positionals[0] ?? "app";
  if (values.target && !["local", "cloud"].includes(values.target))
    throw Error("Target must be local or cloud.");
  if (values.help || command === "help")
    console.log(`System One — your agent's decision center

  npx sysone                 Open the selected local app or cloud dashboard
  sysone login               Sign in to cloud; use its shared free allowance
  sysone logout              Revoke cloud login and select local
  sysone target cloud|local  Choose the default target
  sysone mcp --target cloud  Use cloud through a local MCP stdio bridge
  sysone app --no-open       Start without opening a browser
  sysone status [--connection /private/path/agent.json]
  sysone mcp [--connection /private/path/agent.json]
  sysone computer --connection /private/path/agent.json  MCP browser companion
  sysone computer doctor [--desktop]  Check browser and optional Mac AX setup
  sysone computer --desktop --connection /private/path/agent.json  Also expose read-only Mac AX

App options: --port 4319 --home /private/path
The open-source launcher downloads a checksum-verified application runtime.
Local target: add your Vercel Gateway key in Studio.
Cloud target: sysone login; use the hosted shared free allowance.
The application runtime has a separate preview license; its source is private.
MCP/status use SYSONE_URL and SYSONE_TOKEN, or a scoped connection file.
Default connection: ~/.config/systemoneengine/agent.json
Documentation: https://systemoneengine.com/docs/`);
  else if (command === "login") {
    await login({
      noOpen: values["no-open"],
      onUrl: (url) =>
        console.error("Sign in and approve access in your browser:\n" + url),
    });
    console.log(
      "Connected to System One Cloud. Cloud is now your default target. Run sysone status or sysone mcp.",
    );
  } else if (command === "logout") {
    await logout();
    console.log("Cloud login revoked. Local target selected.");
  } else if (command === "target") {
    if (positionals[1]) await selectTarget(positionals[1]);
    console.log(await selectedTarget());
  } else if (command === "computer" && positionals[1] === "doctor") {
    const report = await computerDoctor({ desktop: values.desktop });
    console.log(JSON.stringify(report, null, 2));
    if (!report.browserReady) process.exitCode = 1;
  } else if (command === "app" || command === "studio") {
    const target = values.target ?? (await selectedTarget());
    if (target === "cloud") {
      const url = cloudOrigin + "/cloud/";
      console.log(url);
      if (!values["no-open"]) openBrowser(url);
    } else {
      await launchApp({
        port: values.port,
        home: values.home,
        noOpen: values["no-open"],
      });
    }
  } else {
    if (values.target && !["local", "cloud"].includes(values.target))
      throw Error("Target must be local or cloud.");
    const useCloud =
      !values.connection &&
      (values.target === "cloud" ||
        (!values.target &&
          !(process.env.SYSONE_URL && process.env.SYSONE_TOKEN) &&
          (await selectedTarget()) === "cloud"));
    const raw: unknown = useCloud
      ? cloudConnection()
      : values.connection
        ? JSON.parse(readFileSync(resolve(values.connection), "utf8"))
        : values.target !== "local" &&
            process.env.SYSONE_URL &&
            process.env.SYSONE_TOKEN
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
      (typeof raw.token !== "string" && typeof raw.token !== "function")
    )
      throw Error("Invalid connection");
    const connection = {
      url: raw.url,
      token: raw.token as string | (() => Promise<string>),
    };
    if (command === "computer")
      await startComputerMcp(connection, { desktop: values.desktop });
    else if (command === "mcp") await startMcp(connection);
    else if (command === "status")
      console.log(
        JSON.stringify(await createClient(connection).capabilities(), null, 2),
      );
    else throw Error("Unknown command");
  }
} catch {
  console.error(
    "System One could not complete the command. Check your network, Node version (22.18+), selected port or scoped connection. For cloud access, run sysone login. Use sysone --help.",
  );
  process.exitCode = 1;
}
