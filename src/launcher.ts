import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  lstat,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { gunzipSync } from "node:zlib";
import { spawn } from "node:child_process";
import { runtime } from "./runtime.js";
export type RuntimeManifest = {
  version: string;
  url: string;
  sha256: string;
  bytes: number;
};
const maxArchive = 24 * 1024 * 1024,
  maxExpanded = 100 * 1024 * 1024;
export function decodeRuntime(
  bytes: Uint8Array,
  manifest: RuntimeManifest,
): { path: string; data: Buffer }[] {
  if (
    bytes.length !== manifest.bytes ||
    bytes.length > maxArchive ||
    createHash("sha256").update(bytes).digest("hex") !== manifest.sha256
  )
    throw Error("Runtime verification failed.");
  const data = JSON.parse(
    gunzipSync(bytes, { maxOutputLength: maxExpanded }).toString("utf8"),
  );
  if (
    data.format !== 1 ||
    data.version !== manifest.version ||
    !Array.isArray(data.files) ||
    data.files.length > 1000
  )
    throw Error("Invalid runtime archive.");
  const seen = new Set<string>();
  const files = data.files.map((file: { path: unknown; data: unknown }) => {
    if (
      typeof file.path !== "string" ||
      typeof file.data !== "string" ||
      !/^(?:dist\/|build\/node\/|package\.json$|LICENSE\.txt$|THIRD_PARTY_NOTICES\.txt$)/.test(
        file.path,
      ) ||
      file.path.split("/").some((p) => !p || p === "." || p === "..") ||
      /[\\:\x00-\x1f]/.test(file.path) ||
      seen.has(file.path)
    )
      throw Error("Unsafe runtime path.");
    seen.add(file.path);
    return { path: file.path, data: Buffer.from(file.data, "base64") };
  });
  if (
    !seen.has("dist/cli.js") ||
    !seen.has("build/node/server/entry.mjs") ||
    !seen.has("package.json")
  )
    throw Error("Incomplete runtime.");
  return files;
}
export async function installRuntime(
  manifest: RuntimeManifest = runtime,
  cache = join(homedir(), ".cache", "systemoneengine"),
  fetcher: typeof fetch = fetch,
) {
  if (
    !/^[a-zA-Z0-9.-]+$/.test(manifest.version) ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256)
  )
    throw Error("Invalid runtime manifest.");
  const target = join(
    resolve(cache),
    `${manifest.version}-${manifest.sha256.slice(0, 16)}`,
  );
  const verified = async () => {
    try {
      if ((await lstat(target)).isSymbolicLink()) return false;
      return (
        (await readFile(join(target, ".verified"), "utf8")) ===
          manifest.sha256 && (await lstat(join(target, "dist/cli.js"))).isFile()
      );
    } catch {
      return false;
    }
  };
  if (await verified()) return join(target, "dist/cli.js");
  if (new URL(manifest.url).protocol !== "https:")
    throw Error("Runtime download requires HTTPS.");
  process.stderr.write(`Downloading System One ${manifest.version}…\n`);
  const response = await fetcher(manifest.url, {
    redirect: "error",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok || !response.body)
    throw Error("Runtime download unavailable.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maxArchive || length > manifest.bytes)
        throw Error("Runtime download too large.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const files = decodeRuntime(Buffer.concat(chunks), manifest);
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const temp = join(
    resolve(cache),
    `.install-${randomBytes(12).toString("hex")}`,
  );
  await mkdir(temp, { mode: 0o700 });
  try {
    for (const file of files) {
      const path = join(temp, file.path);
      await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
      await writeFile(path, file.data, { mode: 0o600, flag: "wx" });
    }
    await writeFile(join(temp, ".verified"), manifest.sha256, {
      mode: 0o600,
      flag: "wx",
    });
    try {
      await rename(temp, target);
    } catch (error) {
      if (!(await verified())) throw error;
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
  return join(target, "dist/cli.js");
}
export async function launchApp(options: {
  port?: string;
  home?: string;
  noOpen?: boolean;
}) {
  const entry = await installRuntime();
  const args = [
    entry,
    "serve",
    ...(options.noOpen ? [] : ["--open"]),
    ...(options.port ? ["--port", options.port] : []),
    ...(options.home ? ["--home", options.home] : []),
  ];
  const child = spawn(process.execPath, args, { stdio: "inherit" });
  const stop = () => child.kill("SIGINT");
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    await new Promise<void>((res, rej) => {
      child.once("error", rej);
      child.once("exit", (code, signal) => {
        if (code === 0 || signal === "SIGINT") res();
        else
          rej(
            Error(
              "System One could not start. Check whether the selected port is in use.",
            ),
          );
      });
    });
  } finally {
    process.off("SIGINT", stop);
    process.off("SIGTERM", stop);
  }
}
