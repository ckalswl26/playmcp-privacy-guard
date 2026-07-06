import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkPrivacyRisk } from "../core/detectors.js";
import { LEVEL_EMOJI } from "../core/types.js";
import { safeLog } from "../utils/safeLogging.js";

export function registerRewriteSafeMessage(server: McpServer): void {
  server.registerTool(
    "rewrite_safe_message",
    {
      title: "Rewrite Safe Message",
      description:
        "개인정보 세이프체크 — Analyzes a message for personal information exposure and returns two privacy-safe rewrite options: option 1 uses star masking (partial form visible), option 2 uses category tag replacement (fully removed, recommended). Raw PII is never stored or included in the response. Ideal for pre-send review in chat or email clients.",
      inputSchema: {
        message: z
          .string()
          .min(1)
          .max(10000)
          .describe("Message to rewrite with PII removed or masked"),
        context: z
          .enum(["messenger", "email", "notice", "work", "general"])
          .optional()
          .default("general")
          .describe(
            "Message context that adjusts risk weight: messenger, email, notice, work, general"
          ),
      },
      annotations: {
        title: "Rewrite Safe Message",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ message, context }) => {
      try {
        const result = checkPrivacyRisk(message, context);

        const lines: string[] = [
          `## Safe Message Rewrite`,
          ``,
          `**Original risk:** ${LEVEL_EMOJI[result.overallRisk]} ${result.overallRisk} (score: ${result.riskScore}/100)`,
          ``,
        ];

        if (result.detectedItems.length === 0) {
          lines.push(
            `✅ No personal information detected. The original message is safe to send.`
          );
        } else {
          lines.push(`### Detected PII`);
          for (const item of result.detectedItems) {
            lines.push(
              `- ${LEVEL_EMOJI[item.level]} **${item.type}** (${item.level}): ${item.description}`
            );
            if (item.masked.length > 0) {
              lines.push(`  → Masked: ${item.masked.join(", ")}`);
            }
          }

          lines.push(``, `### Rewrite Options`);

          lines.push(``, `**Option 1 — Star Masking** (partial form visible)`);
          lines.push("```");
          lines.push(result.maskedMessage);
          lines.push("```");

          lines.push(
            ``,
            `**Option 2 — Category Tags** ✅ Recommended (fully removed)`
          );
          lines.push("```");
          lines.push(result.safeRewrite);
          lines.push("```");

          if (result.warnings.length > 0) {
            lines.push(``, `### Warnings`);
            lines.push(...result.warnings);
          }

          lines.push(``, `### Recommendation`);
          lines.push(result.recommendation);
          lines.push(
            ``,
            `> If sharing personal information is essential, use a secure channel (direct call, encrypted email) instead of messaging apps.`
          );
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        safeLog("error", "rewrite_safe_message error", { err: String(err) });
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
