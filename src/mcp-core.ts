import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputSchemas, services } from "./contracts.js";
export function serviceMcpServer(client: {
  capabilities(): Promise<Record<string, unknown>>;
  patterns?(): Promise<Record<string, unknown>>;
  run(
    service: (typeof services)[number],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}) {
  const server = new McpServer({ name: "sysone-client", version: "0.4.0" });

  const descriptions = {
    decide:
      "Answer bounded boolean, choice or rubric questions over supplied evidence with a fast evaluation model. No prose generation or actions. Keep unknown probability unknown; caller owns escalation.",
    logs: "Triage up to 16 logs using jevlogs. Preserve every archive record. Only confidently routine logs may skip expensive analysis; errors and uncertainty stay eligible.",
    tree: "Select from a caller-provided taxonomy using jev-tree. Bounded recursive choices; uncertain paths request escalation. Never treat the selected ID as authorization.",
    dialogue:
      "Choose silence or an eligible prerecorded dialogue candidate. The caller supplies current facts and completed cues and must reject stale contextId. Never invent dialogue or change game state.",
  };
  server.registerTool(
    "sysone_status",
    {
      description:
        "Read available services and remaining consumer key limits. No model call.",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async () => {
      const result = await client.capabilities();
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result) }],
        structuredContent: result,
      };
    },
  );
  server.registerTool(
    "sysone_patterns",
    {
      description:
        "Discover practical decision recipes with evidence links. Omit id for a compact catalog; pass one id for its editable input and limits. No model call. Choose a pattern before drafting a new evaluation.",
      inputSchema: {
        id: z
          .string()
          .regex(/^[a-z0-9-]{1,64}$/)
          .optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ id }) => {
      try {
        const catalog = (await client.patterns?.()) ?? { patterns: [] };
        const patterns = Array.isArray(catalog.patterns)
          ? (catalog.patterns as Record<string, unknown>[])
          : [];
        const result = id
          ? { patterns: patterns.filter((p) => p.id === id) }
          : { patterns: patterns.map(({ input, ...p }) => p) };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Pattern catalog unavailable. Use sysone_status to check the connection.",
            },
          ],
        };
      }
    },
  );
  for (const service of services)
    server.registerTool(
      `sysone_${service}`,
      {
        description: descriptions[service],
        inputSchema: inputSchemas[service].shape,
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async (
        input: Record<string, unknown>,
        extra: { signal: AbortSignal },
      ) => {
        try {
          const result = await client.run(service, input, extra.signal);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        } catch {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: "System One is unavailable or its key limit was reached. Use the caller’s deterministic fallback or reasoning model. Do not retry automatically.",
              },
            ],
          };
        }
      },
    );
  return server;
}
