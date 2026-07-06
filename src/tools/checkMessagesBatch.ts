import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkPrivacyRisk } from "../core/detectors.js";
import { LEVEL_EMOJI } from "../core/types.js";
import { safeLog } from "../utils/safeLogging.js";

export function registerCheckMessagesBatch(server: McpServer): void {
  server.registerTool(
    "check_messages_batch",
    {
      title: "Check Messages Batch",
      description:
        "개인정보 세이프체크 — Analyzes up to 20 text messages in a single call for personal information exposure risks. Each message is checked independently and returns risk level (CRITICAL/HIGH/MEDIUM/LOW/SAFE), risk score, and detected PII types. Raw PII is never stored or returned; only masked previews are shown. Useful for bulk pre-send screening.",
      inputSchema: {
        messages: z
          .array(z.string().min(1).max(10000))
          .min(1)
          .max(20)
          .describe("List of messages to analyze (max 20)"),
        context: z
          .enum(["messenger", "email", "notice", "work", "general"])
          .optional()
          .default("general")
          .describe(
            "Message context that adjusts risk weight: messenger, email, notice, work, general"
          ),
        strictness: z
          .enum(["strict", "normal", "lenient"])
          .optional()
          .default("normal")
          .describe(
            "Detection strictness: strict (×1.5 score), normal (×1.0), lenient (×0.7)"
          ),
      },
      annotations: {
        title: "Check Messages Batch",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ messages, context, strictness }) => {
      try {
        const lines: string[] = [
          `## Batch Privacy Risk Check (${messages.length} message${messages.length > 1 ? "s" : ""})`,
          ``,
        ];

        let dangerCount = 0;

        for (let i = 0; i < messages.length; i++) {
          const result = checkPrivacyRisk(messages[i], context, strictness);
          if (!result.safeToSend) dangerCount++;

          const maskedPreview =
            result.maskedMessage.length > 50
              ? result.maskedMessage.slice(0, 50) + "…"
              : result.maskedMessage;

          lines.push(
            `### Message ${i + 1} ${LEVEL_EMOJI[result.overallRisk]} — ${
              result.safeToSend ? "Safe" : "**Review required**"
            }`
          );
          lines.push(`> "${maskedPreview}"`);
          lines.push(`- Risk: ${result.overallRisk} (score: ${result.riskScore}/100)`);
          if (result.detectedItems.length > 0) {
            lines.push(
              `- Detected: ${result.detectedItems
                .map((d) => `${d.type}(${d.level})`)
                .join(", ")}`
            );
          }
          lines.push(``);
        }

        lines.push(`---`);
        lines.push(
          `**${dangerCount} of ${messages.length} message${messages.length > 1 ? "s" : ""} require review** (${messages.length - dangerCount} safe)`
        );

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        safeLog("error", "check_messages_batch error", { err: String(err) });
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
