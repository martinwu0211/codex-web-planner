import type { Request, Response } from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Logger } from "../logger/index.js";
import { recordMcpExchange } from "../metrics/token-counter.js";

/**
 * Stateless Streamable HTTP handler: a fresh McpServer + transport per POST.
 * This maximizes compatibility with remote MCP clients (including ChatGPT)
 * and avoids cross-request session state on a public endpoint.
 */
export function createMcpHttpHandler(makeServer: () => McpServer, logger: Logger) {
  return async (req: Request, res: Response): Promise<void> => {
    const inputChars = (() => {
      try { return JSON.stringify(req.body ?? "").length; } catch { return 0; }
    })();
    const startedAt = Date.now();
    if (req.method === "GET" || req.method === "DELETE") {
      // Stateless mode: no server-initiated streams, no sessions to delete.
      res.status(405).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Method not allowed. Use POST." },
        id: null,
      });
      return;
    }
    const server = makeServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    res.on("finish", () => {
      const length = res.getHeader("content-length");
      const outputChars = typeof length === "number" ? length : Number(length ?? 0);
      recordMcpExchange(inputChars, Number.isFinite(outputChars) ? outputChars : 0);
      logger.debug("MCP exchange counted", { inputChars, outputChars, durationMs: Date.now() - startedAt });
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("MCP request handling failed", { message: (error as Error).message });
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  };
}
