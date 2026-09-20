#!/usr/bin/env node
import {parseArgs} from "node:util";
import {readFileSync} from "node:fs";
import {join,resolve} from "node:path";
import {homedir} from "node:os";
import {createClient} from "./client.js";
import {startMcp} from "./mcp.js";
const {values,positionals}=parseArgs({allowPositionals:true,options:{connection:{type:"string"},help:{type:"boolean",short:"h"}}});
try {
 const command=positionals[0]??"help";
 if(values.help||command==="help") console.log(`System One — open-source client\n\n  sysone status [--connection /private/path/agent.json]\n  sysone mcp [--connection /private/path/agent.json]\n\nConnects to an existing System One Engine. The engine and studio are separate\nprivate-source software; this package does not install or launch them.\nSet SYSONE_URL and SYSONE_TOKEN, or use a connection file with {url, token}.\nThe default file is ~/.config/systemoneengine/agent.json.\nDocumentation: https://systemoneengine.com/docs/`);
 else {
  const raw:unknown=values.connection ? JSON.parse(readFileSync(resolve(values.connection),"utf8")) : process.env.SYSONE_URL && process.env.SYSONE_TOKEN ? {url:process.env.SYSONE_URL,token:process.env.SYSONE_TOKEN} : JSON.parse(readFileSync(join(homedir(),".config","systemoneengine","agent.json"),"utf8"));
  if(!raw||typeof raw!=="object"||!("url"in raw)||typeof raw.url!=="string"||!("token"in raw)||typeof raw.token!=="string")throw Error("Invalid connection");
  const connection={url:raw.url,token:raw.token};
  if(command==="mcp")await startMcp(connection);
  else if(command==="status")console.log(JSON.stringify(await createClient(connection).capabilities(),null,2));
  else throw Error("Unknown command");
 }
} catch {console.error("System One could not connect. Check your engine URL, scoped credential and limits. Use sysone --help. No provider key is needed by this client.");process.exitCode=1;}
