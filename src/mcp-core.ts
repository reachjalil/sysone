import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { inputSchemas, services, RunPatternInput } from "./contracts.js";
export function serviceMcpServer(client: {
  capabilities(): Promise<Record<string, unknown>>;
  patterns?(): Promise<Record<string, unknown>>;
  runPattern?(
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
  run(
    service: (typeof services)[number],
    input: unknown,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>>;
}) {
  const server = new McpServer({ name: "systemoneengine", version: "0.5.0" });

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
        "Find a recipe by task, such as palette, item, citation or tool. Pass query to search; pass id for an editable example and policy. No model call. Then use sysone_run with the recipe ID and your evidence.",
      inputSchema: {
        query: z.string().max(160).optional(),
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
    async ({ id, query }) => {
      try {
        const catalog = (await client.patterns?.()) ?? { patterns: [] };
        const patterns = Array.isArray(catalog.patterns)
          ? (catalog.patterns as Record<string, unknown>[])
          : [];
        const terms = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
        const matching = patterns.filter((p) =>
          terms.every((term) =>
            [p.id, p.title, p.category, p.description]
              .join(" ")
              .toLowerCase()
              .includes(term),
          ),
        );
        const result = id
          ? { patterns: patterns.filter((p) => p.id === id) }
          : { patterns: matching.map(p => ({
              id: p.id, title: p.title, description: p.description, service: p.service,
              requiresCandidates: Boolean(p.candidateQuestion),
            })) };
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
  server.registerTool(
    "sysone_run",
    {
      description:
        "Run a saved Jev decision recipe without writing question prompts. Supply pattern and state. Selection recipes also require your candidates as an ID-to-description map; review is added automatically. Returns answers, usage and the recipe policy. No actions or text generation. Use sysone_patterns to find a recipe. When known, include optional callerModel and reasoningEffort for usage comparisons; never guess.",
      inputSchema: RunPatternInput.shape,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (input, extra) => {
      try {
        if (!client.runPattern) throw new Error("Recipe execution unavailable");
        const result = await client.runPattern(input, extra.signal);
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
              text: "Recipe could not run. Check its ID, required candidates, connection scope and limits with sysone_patterns or sysone_status. Keep the task with the caller; do not retry automatically.",
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
        description: descriptions[service] + " When known, include optional callerModel and reasoningEffort for your usage comparison. Omit unknown values; never infer them from the client name.",
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
