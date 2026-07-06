import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkPrivacyRisk } from "../core/detectors.js";
import { LEVEL_EMOJI } from "../core/types.js";
import { safeLog } from "../utils/safeLogging.js";

export function registerMaskSensitiveInfo(server: McpServer): void {
  server.registerTool(
    "mask_sensitive_info",
    {
      title: "Mask Sensitive Info",
      description:
        "개인정보 세이프체크 — Detects personal information in a text and returns a masked safe version. Two masking styles are available: star masking (e.g. 010-****-5678) and category tag replacement (e.g. [Phone number omitted]). Raw PII is never stored or included in the response. Use this to sanitize text before sharing or logging.",
      inputSchema: {
        text: z
          .string()
          .min(1)
          .max(10000)
          .describe("Text to scan and mask for PII"),
        maskStyle: z
          .enum(["star", "tag"])
          .optional()
          .default("star")
          .describe(
            "Masking style: star (010-****-1234, partial form visible) or tag ([Phone number omitted], fully removed)"
          ),
        context: z
          .enum(["messenger", "email", "notice", "work", "general"])
          .optional()
          .default("general")
          .describe(
            "Message context that adjusts risk weight: messenger, email, notice, work, general"
          ),
      },
      annotations: {
        title: "Mask Sensitive Info",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ text, maskStyle, context }) => {
      try {
        const result = checkPrivacyRisk(text, context);
        const output =
          maskStyle === "tag" ? result.safeRewrite : result.maskedMessage;
        const changed = output !== text;

        const lines: string[] = [
          `## Masking Result`,
          ``,
          `**Detected items:** ${result.detectedItems.length}`,
          `**Overall risk:** ${LEVEL_EMOJI[result.overallRisk]} ${result.overallRisk}`,
          `**Mask style:** ${maskStyle === "tag" ? "Category tag" : "Star masking"}`,
          `**Changed:** ${changed ? "✅ Masking applied" : "No change (no PII detected)"}`,
        ];

        if (result.detectedItems.length > 0) {
          lines.push(``, `**Detected items:**`);
          for (const item of result.detectedItems) {
            lines.push(
              `- ${LEVEL_EMOJI[item.level]} ${item.type} (${item.level}, ${item.count} match${item.count > 1 ? "es" : ""}): ${item.description}`
            );
          }
        }

        lines.push(``, `### Masked Text`, "```", output, "```");

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        safeLog("error", "mask_sensitive_info error", { err: String(err) });
        return {
          content: [
            {
              type: "text",
              text: "An error occurred while processing the request. Please check the input.",
            },
          ],
          isError: true,
        };
      }
    }
  );
}
