import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCheckMessagePrivacy } from "./tools/checkMessagePrivacy.js";
import { registerCheckMessagesBatch } from "./tools/checkMessagesBatch.js";
import { registerMaskSensitiveInfo } from "./tools/maskSensitiveInfo.js";
import { registerRewriteSafeMessage } from "./tools/rewriteSafeMessage.js";
import { registerGetPrivacyRiskGuide } from "./tools/getPrivacyRiskGuide.js";
export function createServer() {
    const server = new McpServer({
        name: "Privacy Guard MCP",
        version: "1.0.0",
    });
    registerCheckMessagePrivacy(server);
    registerCheckMessagesBatch(server);
    registerMaskSensitiveInfo(server);
    registerRewriteSafeMessage(server);
    registerGetPrivacyRiskGuide(server);
    return server;
}
