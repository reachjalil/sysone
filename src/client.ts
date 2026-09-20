import { ServiceError, type Service, RunPatternInput, type PatternRequest } from "./contracts.js";
export function engineUrl(url: string) {
  const parsed = new URL(url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname);
  if (
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && local)) ||
    parsed.username ||
    parsed.password ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(
      "Use a loopback HTTP or HTTPS engine origin without credentials, path, query or fragment.",
    );
  return parsed.origin;
}
export function createClient(options: {
  url: string;
  token: string;
  transport?: "mcp-stdio";
  clientInfo?: () => { name: string; version: string } | undefined;
}) {
  const origin = engineUrl(options.url);
  if (!options.token || options.token.length > 4096)
    throw new Error("A scoped consumer token is required.");
  async function request(path: string, input?: unknown, signal?: AbortSignal) {
    const response = await fetch(`${origin}${path}`, {
      method: input === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
        ...(options.transport
          ? { "X-Sysone-Transport": options.transport }
          : {}),
        ...(options.clientInfo?.()
          ? {
              "X-Sysone-Client-Name": encodeURIComponent(
                options.clientInfo()!.name.slice(0, 80),
              ),
              "X-Sysone-Client-Version": encodeURIComponent(
                options.clientInfo()!.version.slice(0, 40),
              ),
            }
          : {}),
      },
      ...(input === undefined ? {} : { body: JSON.stringify(input) }),
      redirect: "error",
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
    });
    if (!response.ok)
      throw new ServiceError(response.status, "System One request failed.");
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty response");
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 256000) throw new Error("Response too large");
        parts.push(value);
      }
    } finally {
      await reader.cancel();
    }
    const text = new TextDecoder().decode(
      Uint8Array.from(parts.flatMap((p) => Array.from(p))),
    );
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid engine response.");
    return value as Record<string, unknown>;
  }
  return {
    capabilities: () => request("/v1/capabilities"),
    patterns: () => request("/v1/patterns"),
    runPattern: (input: PatternRequest, signal?: AbortSignal) => request("/v1/patterns/run", RunPatternInput.parse(input), signal),
    run: (service: Service, input: unknown, signal?: AbortSignal) => {
      if (!["decide", "logs", "tree", "dialogue"].includes(service))
        throw new Error("Unknown service.");
      return request(`/v1/${service}`, input, signal);
    },
  };
}
