import type {
  PatternDef,
  DetectedItem,
  MessageContext,
  Strictness,
  CheckResult,
  RiskLevel,
} from "./types.js";
import { maskString } from "./masking.js";
import {
  calcScore,
  overallLevel,
  RECOMMENDATIONS,
} from "./riskScoring.js";

// ─────────────────────────────────────────────────────────────────
// Pattern definitions
//
// Order matters for masking priority:
//   1) Phone numbers (mobile + landline) come BEFORE account numbers
//      so that 010-XXXX-XXXX is never misclassified as a bank account.
//   2) Card numbers (16-digit) come before account numbers.
//   3) Within same priority, more specific patterns come first.
//
// Account number regex also carries negative lookaheads to exclude
// mobile and landline prefixes even when detection order shifts.
// ─────────────────────────────────────────────────────────────────
export const PATTERN_DEFS: PatternDef[] = [
  // ── CRITICAL ──────────────────────────────────────────────────
  {
    name: "주민등록번호",
    level: "CRITICAL",
    description:
      "National ID number detected — directly enables identity theft and financial fraud.",
    safeTag: "[주민등록번호 생략]",
    regex: /\b(\d{6})[-–—]([0-9]\d{6})\b/g,
    mask: (m) => m.slice(0, 7) + "●●●●●●",
  },
  {
    // Must come before account number to avoid 16-digit partial overlap
    name: "신용/체크카드 번호",
    level: "CRITICAL",
    description:
      "16-digit card number detected — sharing this enables card abuse.",
    safeTag: "[카드번호 생략]",
    regex: /\b(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})[-\s]?(\d{4})\b/g,
    mask: (m) => {
      const d = m.replace(/[-\s]/g, "");
      return d.slice(0, 4) + "-****-****-" + d.slice(-4);
    },
  },
  {
    name: "여권번호",
    level: "CRITICAL",
    description:
      "Passport number detected — can be used directly for identity theft.",
    safeTag: "[여권번호 생략]",
    regex: /\b[A-Z]{1,2}\d{7,8}\b/g,
    mask: (m) => m.slice(0, 2) + "*".repeat(m.length - 2),
  },

  // ── HIGH ───────────────────────────────────────────────────────
  {
    // Must come before account number: 010-XXXX-XXXX matches both patterns
    name: "휴대전화번호",
    level: "HIGH",
    description:
      "Mobile phone number detected — risk of spam, voice phishing, and stalking.",
    safeTag: "[전화번호 생략]",
    regex: /\b(01[016789])[-.\s]?(\d{3,4})[-.\s]?(\d{4})\b/g,
    mask: (m) => {
      const d = m.replace(/[-.\s]/g, "");
      return d.slice(0, 3) + "-****-" + d.slice(-4);
    },
  },
  {
    name: "상세 주소",
    level: "HIGH",
    description:
      "Detailed address detected — exposes residence and creates stalking risk.",
    safeTag: "[주소 생략]",
    regex:
      /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)[가-힣\s\d\-]+?(로|길|가|동|읍|면|리)\s*\d+(?:[-–]\d+)?/g,
    mask: (m) => {
      const r = m.match(
        /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/
      );
      return (r ? r[0] : "") + " ●●● [address masked]";
    },
  },
  {
    name: "운전면허번호",
    level: "HIGH",
    description:
      "Driver's license number detected — can be used for personal identification.",
    safeTag: "[운전면허번호 생략]",
    regex: /\b(\d{2})[-–](\d{6})[-–](\d{2})\b/g,
    mask: (m) => m.slice(0, 2) + "-******-**",
  },

  // ── CRITICAL (account — after phone numbers) ──────────────────
  {
    // Negative lookaheads exclude mobile (01X) and landline (0[2-6]X) prefixes
    // so 010-XXXX-XXXX and 031-XXXX-XXXX are never classified as account numbers.
    name: "계좌번호",
    level: "CRITICAL",
    description:
      "Bank account number detected — can be used directly for financial fraud.",
    safeTag: "[계좌번호 생략]",
    regex:
      /\b(?!01[016789])(?!0[2-6]\d)(\d{3,4})[-–—](\d{2,6})[-–—](\d{2,7})(?:[-–—]\d{1,3})?\b/g,
    mask: (m) => {
      const parts = m.split(/[-–—]/);
      return (
        parts[0] +
        "-" +
        "*".repeat(parts[1].length) +
        "-" +
        "*".repeat(parts[2].length)
      );
    },
  },

  // ── MEDIUM ─────────────────────────────────────────────────────
  {
    // Must come before account number: 031-XXXX-XXXX matches both patterns
    name: "일반 전화번호",
    level: "MEDIUM",
    description: "Landline phone number detected.",
    safeTag: "[전화번호 생략]",
    regex: /\b(0[2-9]\d{1,2})[-.\s](\d{3,4})[-.\s](\d{4})\b/g,
    mask: (m) => m.replace(/(\d{3,4})([-.\s]\d{4})$/, "****$2"),
  },
  {
    name: "이메일 주소",
    level: "MEDIUM",
    description:
      "Email address detected — a target for spam and phishing attacks.",
    safeTag: "[이메일 생략]",
    regex: /\b([A-Za-z0-9._%+\-]+)@([A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b/g,
    mask: (m) => {
      const at = m.indexOf("@");
      return maskString(m.slice(0, at), 2) + "@" + m.slice(at + 1);
    },
  },
  {
    name: "생년월일",
    level: "MEDIUM",
    description:
      "Date of birth detected — enables identity verification when combined with other data.",
    safeTag: "[생년월일 생략]",
    regex:
      /\b(19|20)\d{2}[년./-](0?[1-9]|1[0-2])[월./-](0?[1-9]|[12]\d|3[01])일?\b/g,
    mask: (m) => m.slice(0, 4) + "년 **월 **일",
  },
  {
    name: "SNS/메신저 계정",
    level: "MEDIUM",
    description:
      "SNS or messenger account detected — sharing without consent can enable doxxing.",
    safeTag: "[SNS 계정 생략]",
    regex:
      /(카카오아이디|카톡\s?아이디|카카오\s?톡|인스타\s?아이디|인스타그램|페이스북|트위터|유튜브|틱톡)\s*[:：]?\s*([A-Za-z0-9_.가-힣]{3,30})/gi,
    mask: (m) => {
      const parts = m.split(/[:：\s]+/);
      return parts.length > 1
        ? parts[0] + ": " + maskString(parts[parts.length - 1], 2)
        : m;
    },
  },
  {
    name: "사업자등록번호",
    level: "MEDIUM",
    description:
      "Business registration number detected — can be used to identify a legal entity.",
    safeTag: "[사업자번호 생략]",
    regex: /\b\d{3}-\d{2}-\d{5}\b/g,
    mask: (m) => m.slice(0, 3) + "-**-*****",
  },

  // ── LOW ────────────────────────────────────────────────────────
  {
    name: "IP 주소",
    level: "LOW",
    description: "IP address detected — can be used for location tracking.",
    safeTag: "[IP 생략]",
    regex:
      /\b((?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g,
    mask: (m) => {
      const p = m.split(".");
      return p[0] + "." + p[1] + ".***.***";
    },
  },
  {
    name: "위치 좌표",
    level: "LOW",
    description:
      "GPS coordinates detected — enables precise location tracking.",
    safeTag: "[위치정보 생략]",
    // Korean mainland: lat 34–38, lng 125–129
    regex: /\b(3[4-8]\.\d{4,6})[,\s]+(12[5-9]\.\d{4,6})\b/g,
    mask: (_m) => "[lat omitted], [lng omitted]",
  },
];

// ─────────────────────────────────────────────────────────────────
// Context-combination risks (name + region/org/demographics)
// ─────────────────────────────────────────────────────────────────
function detectContextRisks(text: string): DetectedItem[] {
  const risks: DetectedItem[] = [];

  const hasKoreanName =
    /[가-힣]{2,4}(씨|님|군|양|선생님?|교수님?|의사님?|변호사|대표님?|이사님?|팀장님?|부장님?|과장님?|대리님?|사원)?/.test(
      text
    );
  const hasRegion =
    /(서울|부산|대구|인천|광주|대전|울산|세종|경기|강원|충북|충남|전북|전남|경북|경남|제주)/.test(
      text
    );
  const hasOrg =
    /(회사|직장|학교|대학교?|고등학교|중학교|병원|은행|관|청|센터|연구소|연구원|부서|팀|군부대|경찰서|소방서)/.test(
      text
    );
  const hasAge =
    /(나이|살|세)\s*[:：]?\s*\d{1,2}|\d{1,2}\s*(살|세)\b/.test(text);
  const hasGender = /(남자|여자|남성|여성|남|여)\b/.test(text);

  if (hasKoreanName && hasRegion && hasOrg) {
    risks.push({
      type: "신상털림 고위험 조합",
      level: "CRITICAL",
      description:
        "Name + region + organization detected together — sufficient to uniquely identify an individual.",
      masked: [],
      count: 1,
    });
  } else if (hasKoreanName && (hasRegion || hasOrg)) {
    risks.push({
      type: "이름+소속 식별 조합",
      level: "HIGH",
      description:
        "Name combined with region or organization — can be used for personal identification.",
      masked: [],
      count: 1,
    });
  }

  if (hasAge && hasGender && hasKoreanName) {
    risks.push({
      type: "인적사항 조합",
      level: "HIGH",
      description:
        "Name + age + gender detected together — sufficient to identify an individual.",
      masked: [],
      count: 1,
    });
  }

  return risks;
}

// ─────────────────────────────────────────────────────────────────
// Main detection entry point
// ─────────────────────────────────────────────────────────────────
export function checkPrivacyRisk(
  text: string,
  context: MessageContext = "general",
  strictness: Strictness = "normal"
): CheckResult {
  const detectedItems: DetectedItem[] = [];
  let maskedMessage = text;
  let safeRewrite = text;
  const warnings: string[] = [];

  for (const def of PATTERN_DEFS) {
    const regex = new RegExp(def.regex.source, def.regex.flags);
    const rawMatches = [...text.matchAll(regex)].map((m) => m[0]);
    if (rawMatches.length === 0) continue;

    const unique = [...new Set(rawMatches)];
    const maskedValues = unique.map(def.mask);

    // Apply masking to accumulated output, never storing raw PII
    for (let i = 0; i < unique.length; i++) {
      maskedMessage = maskedMessage.replaceAll(unique[i], maskedValues[i]);
      safeRewrite = safeRewrite.replaceAll(unique[i], def.safeTag);
    }

    detectedItems.push({
      type: def.name,
      level: def.level,
      description: def.description,
      masked: maskedValues,
      count: rawMatches.length,
    });

    if (def.level === "CRITICAL") {
      warnings.push(`⚠️ ${def.name}: Do not send via any channel.`);
    }
  }

  const contextRisks = detectContextRisks(text);
  detectedItems.push(...contextRisks);

  const score = calcScore(detectedItems, context, strictness);
  const overall = overallLevel(score);
  const safeToSend =
    overall === "SAFE" ||
    (overall === "LOW" && strictness !== "strict");

  // Build summary grouped by level
  const byLevel: Record<RiskLevel, DetectedItem[]> = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: [],
  };
  for (const item of detectedItems) byLevel[item.level].push(item);

  const summaryLines: string[] = [];
  if (detectedItems.length === 0) {
    summaryLines.push("No personal information detected.");
  } else {
    if (byLevel.CRITICAL.length)
      summaryLines.push(
        `🚨 CRITICAL: ${byLevel.CRITICAL.map((i) => i.type).join(", ")}`
      );
    if (byLevel.HIGH.length)
      summaryLines.push(
        `⚠️ HIGH: ${byLevel.HIGH.map((i) => i.type).join(", ")}`
      );
    if (byLevel.MEDIUM.length)
      summaryLines.push(
        `⚡ MEDIUM: ${byLevel.MEDIUM.map((i) => i.type).join(", ")}`
      );
    if (byLevel.LOW.length)
      summaryLines.push(
        `ℹ️ LOW: ${byLevel.LOW.map((i) => i.type).join(", ")}`
      );
  }

  return {
    overallRisk: overall,
    riskScore: score,
    detectedItems,
    safeToSend,
    summary: summaryLines.join("\n"),
    recommendation: RECOMMENDATIONS[overall],
    maskedMessage,
    safeRewrite,
    warnings,
  };
}
