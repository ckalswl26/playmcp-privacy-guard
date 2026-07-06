import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerGetPrivacyRiskGuide(server: McpServer): void {
  server.registerTool(
    "get_privacy_risk_guide",
    {
      title: "Get Privacy Risk Guide",
      description:
        "개인정보 세이프체크 — Returns the complete reference guide for privacy risk levels, detected PII types, context multipliers, and privacy-by-design principles. Call this first to understand how risk scoring works before using the other tools.",
      annotations: {
        title: "Get Privacy Risk Guide",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async () => {
      const guide = `## Privacy Guard MCP — Risk Level Guide

### Risk Level System

| Level | Score | Meaning | Action |
|-------|-------|---------|--------|
| 🚨 CRITICAL | 40+ | Directly enables financial fraud or identity theft | Stop immediately, remove the information |
| ⚠️ HIGH | 20–39 | Enables identification or stalking | Share only when strictly necessary |
| ⚡ MEDIUM | 10–19 | Secondary harm potential | Verify recipient trust before sending |
| ℹ️ LOW | 1–9 | Low risk | Send with caution |
| ✅ SAFE | 0 | No risk detected | Safe to send |

### Detected PII Types (14 patterns + 3 combination rules)

#### 🚨 CRITICAL (Never send)
- **National ID (주민등록번호)** — Core data for identity theft and financial fraud (40 pts)
- **Credit/Debit Card Number** — Card abuse risk (40 pts)
- **Bank Account Number** — Direct financial fraud vector (40 pts)
- **Passport Number** — Direct identity theft vector (40 pts)
- **High-risk combination** — Name + region + organization exposed together (40 pts)

#### ⚠️ HIGH (Strongly avoid)
- **Mobile Phone Number** — Spam, voice phishing, stalking (20 pts)
- **Detailed Address** — Residence exposure, stalking risk (20 pts)
- **Driver's License Number** — Personal identification (20 pts)
- **Identity combination** — Name + region or name + organization (20 pts)
- **Personal profile combination** — Name + age + gender (20 pts)

#### ⚡ MEDIUM (Caution)
- **Email Address** — Spam and phishing target (10 pts)
- **Landline Phone Number** — Commercial misuse (10 pts)
- **Date of Birth** — Enables identification when combined (10 pts)
- **SNS/Messenger Account** — Do not share without consent (10 pts)
- **Business Registration Number** — Legal entity identification (10 pts)

#### ℹ️ LOW (Minor)
- **IP Address** — Location tracking possibility (3 pts)
- **GPS Coordinates** — Location tracking (3 pts)

### Context Multipliers

| Context | Multiplier | Description |
|---------|-----------|-------------|
| messenger | ×1.2 | Personal chat messages |
| email | ×1.0 | Email (baseline) |
| notice | ×1.3 | Public announcements — strictest |
| work | ×1.1 | Business messages |
| general | ×1.0 | General purpose (default) |

### Strictness Multipliers

| Strictness | Multiplier | Recommended for |
|-----------|-----------|-----------------|
| strict | ×1.5 | Government, healthcare, finance |
| normal | ×1.0 | General use |
| lenient | ×0.7 | Internal system testing |

### Privacy-by-Design Principles
1. **No raw PII storage** — Original personal information is processed in memory only and never included in responses
2. **Minimum processing** — Only the minimum processing needed for detection and masking is performed
3. **Local processing** — All analysis runs server-side; no data is sent to external AI APIs
4. **Purpose limitation** — Data is used solely for risk detection, not any other purpose
5. **Safe logging** — Original message content is never written to logs

### Privacy Protection Tips
1. Never send personal information to unknown recipients
2. Avoid sharing personal information in group chats
3. Do not share screenshots containing others' personal information without consent
4. Combinations of name + phone, name + address, or name + workplace are the core ingredients of doxxing
5. If a suspicious link asks for personal information, block it immediately
`;
      return { content: [{ type: "text", text: guide }] };
    }
  );
}
