import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { decodeRuntime, installRuntime } from "../dist/launcher.js";
function fixture(extra = []) {
  const bytes = gzipSync(
    JSON.stringify({
      format: 1,
      version: "test-1",
      files: [
        ...["dist/cli.js", "build/node/server/entry.mjs", "package.json"].map(
          (path) => ({ path, data: Buffer.from("test").toString("base64") }),
        ),
        ...extra,
      ],
    }),
  );
  return {
    bytes,
    manifest: {
      version: "test-1",
      url: "https://systemoneengine.com/releases/test.json.gz",
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
    },
  };
}
test("launcher rejects changed bytes, traversal and duplicate archive paths before installation", () => {
  const f = fixture();
  assert.equal(decodeRuntime(f.bytes, f.manifest).length, 3);
  assert.throws(
    () => decodeRuntime(Buffer.from("changed"), f.manifest),
    /verification/,
  );
  for (const path of [
    "dist/../../escape",
    "dist/../escape",
    "dist/x\\escape",
    "dist/cli.js",
    "/etc/file",
    "dist/C:evil",
  ]) {
    const g = fixture([{ path, data: "dGVzdA==" }]);
    assert.throws(() => decodeRuntime(g.bytes, g.manifest), /path/);
  }
});
test("launcher installs atomically, caches verified runtime and rejects redirects/oversized downloads", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sysone-launch-test-"));
  const f = fixture();
  let downloads = 0;
  const fetcher = async (url, opts) => {
    downloads++;
    assert.equal(opts.redirect, "error");
    return new Response(f.bytes);
  };
  try {
    const file = await installRuntime(f.manifest, dir, fetcher);
    assert.equal(await readFile(file, "utf8"), "test");
    assert.equal(await installRuntime(f.manifest, dir, fetcher), file);
    assert.equal(downloads, 1);
    await assert.rejects(
      installRuntime(
        { ...f.manifest, version: "another" },
        dir,
        async () => new Response(Buffer.alloc(f.bytes.length + 1)),
      ),
      /large/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
