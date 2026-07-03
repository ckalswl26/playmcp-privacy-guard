#!/usr/bin/env node
import http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createServer } from "./server.js";
import { safeLog } from "./utils/safeLogging.js";
const PORT = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? "0.0.0.0";
function setCorsHeaders(res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, MCP-Protocol-Version, Authorization");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
}
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", (chunk) => {
            data += chunk.toString();
        });
        req.on("end", () => {
            try {
                resolve(data ? JSON.parse(data) : undefined);
            }
            catch {
                resolve(undefined);
            }
        });
        req.on("error", reject);
    });
}
const httpServer = http.createServer(async (req, res) => {
    setCorsHeaders(res);
    // Preflight
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    // ── GET /health ──────────────────────────────────────────────
    if (url.pathname === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            status: "ok",
            service: "Privacy Guard MCP",
            version: "1.0.0",
            ts: new Date().toISOString(),
        }));
        return;
    }
    // ── POST /mcp — stateless: new transport + server per request ─
    if (url.pathname === "/mcp") {
        if (req.method === "POST") {
            const body = await parseBody(req);
            // Stateless mode: sessionIdGenerator undefined means no session tracking.
            // Each request is fully independent and self-contained.
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: undefined,
            });
            const mcpServer = createServer();
            await mcpServer.connect(transport);
            await transport.handleRequest(req, res, body);
            return;
        }
        // Stateless mode does not use persistent SSE streams or session lifecycle
        res.writeHead(405, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
            error: "Method not allowed. Only POST is supported on /mcp (stateless mode).",
        }));
        return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
});
httpServer.listen(PORT, HOST, () => {
    safeLog("info", "Privacy Guard MCP server started", {
        port: PORT,
        host: HOST,
    });
    safeLog("info", "Endpoints ready", {
        health: `http://localhost:${PORT}/health`,
        mcp: `http://localhost:${PORT}/mcp`,
    });
});
process.on("SIGTERM", () => {
    safeLog("info", "Shutting down gracefully...");
    httpServer.close(() => process.exit(0));
});
