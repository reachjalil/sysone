import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  unlink,
  open,
} from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
export const cloudOrigin = "https://cloud.systemoneengine.com";
export const configHome = () => join(homedir(), ".config", "systemoneengine");
type Credentials = {
  origin: string;
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};
export async function savePrivate(home: string, name: string, value: unknown) {
  await mkdir(home, { recursive: true, mode: 0o700 });
  const temp = join(home, `.${name}.${randomBytes(8).toString("hex")}`);
  try {
    await writeFile(temp, JSON.stringify(value) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
    await rename(temp, join(home, name));
  } finally {
    await unlink(temp).catch(() => {});
  }
}
export async function selectedTarget(
  home = configHome(),
): Promise<"local" | "cloud"> {
  try {
    const v = JSON.parse(await readFile(join(home, "target.json"), "utf8"));
    return v.target === "cloud" ? "cloud" : "local";
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return "local";
    throw e;
  }
}
export async function selectTarget(target: string, home = configHome()) {
  if (!["local", "cloud"].includes(target))
    throw Error("Target must be local or cloud.");
  await savePrivate(home, "target.json", { target });
}
export function openBrowser(url: string) {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "rundll32"
        : "xdg-open";
  const child = spawn(
    command,
    process.platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url],
    { stdio: "ignore", detached: true },
  );
  child.on("error", () => {});
  child.unref();
}
async function jsonRequest(
  url: string,
  body: URLSearchParams | Record<string, unknown>,
) {
  const form = body instanceof URLSearchParams;
  const r = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers: {
      "content-type": form
        ? "application/x-www-form-urlencoded"
        : "application/json",
    },
    body: form ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Cloud authorization failed. Run sysone login again.");
  const text = await r.text();
  if (text.length > 32000) throw Error("Invalid authorization response.");
  return JSON.parse(text);
}
function credentials(
  origin: string,
  clientId: string,
  t: Record<string, unknown>,
): Credentials {
  if (
    typeof t.access_token !== "string" ||
    !t.access_token.startsWith("sysa_") ||
    typeof t.refresh_token !== "string" ||
    t.refresh_token.length > 4096 ||
    t.access_token.length > 4096 ||
    typeof t.expires_in !== "number" ||
    !Number.isFinite(t.expires_in) ||
    t.expires_in <= 0
  )
    throw Error("Invalid cloud token response.");
  return {
    origin,
    clientId,
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
  };
}
export async function login(
  options: {
    home?: string;
    noOpen?: boolean;
    onUrl?: (url: string) => void;
  } = {},
) {
  const home = options.home ?? configHome(),
    origin = cloudOrigin,
    state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url"),
    path = "/callback/" + randomBytes(16).toString("hex");
  let resolveCode!: (v: string) => void, rejectCode!: (e: Error) => void;
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  void codePromise.catch(() => {});
  const server = createServer((req, res) => {
    const u = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    if (
      req.method !== "GET" ||
      u.pathname !== path ||
      u.searchParams.get("state") !== state
    ) {
      res.writeHead(400).end("Invalid login callback.");
      return;
    }
    if (u.searchParams.get("error")) {
      rejectCode(Error("Cloud access was not approved."));
      res.end("Access was not approved. Return to your terminal.");
      return;
    }
    if (u.searchParams.get("iss") !== origin || !u.searchParams.get("code")) {
      res.writeHead(400).end("Invalid authorization response.");
      return;
    }
    resolveCode(u.searchParams.get("code")!);
    res.end("System One authorization received. Return to your terminal.");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string")
    throw Error("Unable to open login callback.");
  const redirect = `http://127.0.0.1:${address.port}${path}`;
  const timer = setTimeout(
    () => rejectCode(Error("Cloud login expired. Run sysone login again.")),
    300000,
  );
  try {
    const registration = await jsonRequest(origin + "/register", {
      client_name: "sysone CLI",
      redirect_uris: [redirect],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    });
    if (typeof registration.client_id !== "string")
      throw Error("Invalid registration.");
    const url =
      origin +
      "/authorize?" +
      new URLSearchParams({
        client_id: registration.client_id,
        redirect_uri: redirect,
        response_type: "code",
        resource: origin + "/mcp",
        scope: "decide logs tree dialogue",
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      });
    options.onUrl?.(url);
    if (!options.noOpen) openBrowser(url);
    const code = await codePromise;
    const tokens = await jsonRequest(
      origin + "/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        client_id: registration.client_id,
        redirect_uri: redirect,
        code,
        code_verifier: verifier,
        resource: origin + "/mcp",
      }),
    );
    await savePrivate(
      home,
      "cloud.json",
      credentials(origin, registration.client_id, tokens),
    );
    await selectTarget("cloud", home);
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
async function readCredentials(home: string) {
  const c = JSON.parse(
    await readFile(join(home, "cloud.json"), "utf8"),
  ) as Credentials;
  if (
    c.origin !== cloudOrigin ||
    typeof c.clientId !== "string" ||
    typeof c.refreshToken !== "string" ||
    typeof c.accessToken !== "string" ||
    !Number.isFinite(c.expiresAt)
  )
    throw Error("Invalid cloud connection. Run sysone login.");
  return c;
}
export function cloudConnection(home = configHome()) {
  let refreshing: Promise<string> | undefined;
  async function token() {
    const c = await readCredentials(home);
    if (c.expiresAt > Date.now() + 60000) return c.accessToken;
    refreshing ??= (async () => {
      const lock = join(home, "cloud-refresh.lock");
      let handle;
      for (let i = 0; i < 50; i++) {
        try {
          handle = await open(lock, "wx", 0o600);
          break;
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      if (!handle)
        throw Error(
          "Cloud credentials are busy. Try again or run sysone login.",
        );
      try {
        const latest = await readCredentials(home);
        if (latest.expiresAt > Date.now() + 60000) return latest.accessToken;
        const t = await jsonRequest(
          cloudOrigin + "/token",
          new URLSearchParams({
            grant_type: "refresh_token",
            client_id: latest.clientId,
            refresh_token: latest.refreshToken,
            resource: cloudOrigin + "/mcp",
          }),
        );
        const next = credentials(cloudOrigin, latest.clientId, t);
        await savePrivate(home, "cloud.json", next);
        return next.accessToken;
      } finally {
        await handle.close();
        await unlink(lock).catch(() => {});
      }
    })().finally(() => {
      refreshing = undefined;
    });
    return refreshing;
  }
  return { url: cloudOrigin, token };
}
export async function logout(home = configHome()) {
  const c = await readCredentials(home);
  const r = await fetch(cloudOrigin + "/revoke", {
    method: "POST",
    redirect: "error",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.clientId,
      token: c.refreshToken,
      token_type_hint: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok)
    throw Error(
      "Cloud revocation failed. Try again before removing this login.",
    );
  await unlink(join(home, "cloud.json"));
  await selectTarget("local", home);
}
