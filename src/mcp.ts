import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createClient } from "./client.js";
import { serviceMcpServer } from "./mcp-core.js";
export { serviceMcpServer } from "./mcp-core.js";
export function mcpServer(connection: {
  url: string;
  token: string | (() => Promise<string>);
}) {
  let server: McpServer;
  const client = createClient({
    ...connection,
    transport: "mcp-stdio",
    clientInfo: () => server?.server.getClientVersion(),
  });
  server = serviceMcpServer(client);
  return server;
}
export async function startMcp(connection: {
  url: string;
  token: string | (() => Promise<string>);
}) {
  const server = mcpServer(connection);
  await server.connect(new StdioServerTransport());
  return server;
}
