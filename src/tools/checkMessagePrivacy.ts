import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { checkPrivacyRisk } from "../core/detectors.js";
import { LEVEL_EMOJI } from "../core/types.js";
import { safeLog } from "../utils/safeLogging.js";

export function registerCheckMessagePrivacy(server: McpServer): void {
  server.registerTool(
    "check_message_privacy",
    {
      title: "Check Message Privacy",
      description:
        "개인정보 세이프체크 — Analyzes a text message for personal information exposure risks before sending. Detects 14 PII types including national ID, card number, bank account, phone number, email, passport, driver's license, address, date of birth, and more. Returns risk score (0–100), risk level (CRITICAL/HIGH/MEDIUM/LOW/SAFE), detected items with masked forms, and two safe rewrite options. Raw PII is never stored or returned.",
      inputSchema: {
        message: z
          .string()
          .min(1)
          .max(10000)
          .describe("Text message to analyze for PII exposure risks"),
        context: z
          .enum(["messenger", "email", "notice", "work", "general"])
          .optional()
          .default("general")
          .describe(
            "Message context that adjusts risk weight: messenger (personal chat), email, notice (public announcement), work (business message), general (default)"
          ),
        strictness: z
          .enum(["strict", "normal", "lenient"])
          .optional()
          .default("normal")
          .describe(
            "Detection strictness: strict (×1.5 score), normal (×1.0), lenient (×0.7)"
          ),
        showMasked: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Whether to include masked and safe-rewrite versions in the response"
          ),
      },
      annotations: {
        title: "Check Message Privacy",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ message, context, strictness, showMasked }) => {
      try {
        const result = checkPrivacyRisk(message, context, strictness);
        const emoji = LEVEL_EMOJI[result.overallRisk];

        const lines: string[] = [
          `## Privacy Risk Check Result`,
          ``,
          `**Overall Risk:** ${emoji} ${result.overallRisk} (score: ${result.riskScore}/100)`,
          `**Safe to Send:** ${result.safeToSend ? "✅ Yes" : "🚫 No — review required"}`,
          `**Context:** ${context ?? "general"} | **Strictness:** ${strictness ?? "normal"}`,
          ``,
          `### Detection Summary`,
          result.summary || "No PII detected",
          ``,
          `### Recommendation`,
          result.recommendation,
        ];

        if (result.detectedItems.length > 0) {
          lines.push(``, `### Detected Items`);
          for (const item of result.detectedItems) {
            lines.push(
              ``,
              `**[${LEVEL_EMOJI[item.level]} ${item.type}]** (${item.count} match${item.count > 1 ? "es" : ""})`
            );
            lines.push(`- Risk level: ${item.level}`);
            lines.push(`- Reason: ${item.description}`);
            if (item.masked.length > 0) {
              lines.push(`- Masked: ${item.masked.join(", ")}`);
            }
          }
        }

        if (result.warnings.length > 0) {
          lines.push(``, `### Warnings`);
          lines.push(...result.warnings);
        }

        if (showMasked && result.maskedMessage !== message) {
          lines.push(``, `### Safe Version — Star Masking`);
          lines.push("```");
          lines.push(result.maskedMessage);
          lines.push("```");
          lines.push(``, `### Safe Version — Category Tags (Recommended)`);
          lines.push("```");
          lines.push(result.safeRewrite);
          lines.push("```");
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (err) {
        safeLog("error", "check_message_privacy error", { err: String(err) });
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
