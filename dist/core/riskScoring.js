export const LEVEL_SCORES = {
    CRITICAL: 40,
    HIGH: 20,
    MEDIUM: 10,
    LOW: 3,
};
// Context multipliers — public notices are stricter; general/email are baseline
export const CONTEXT_MULTIPLIERS = {
    messenger: 1.2,
    email: 1.0,
    notice: 1.3,
    work: 1.1,
    general: 1.0,
};
export const STRICTNESS_MULTIPLIERS = {
    strict: 1.5,
    normal: 1.0,
    lenient: 0.7,
};
export function calcScore(items, context = "general", strictness = "normal") {
    const base = items.reduce((sum, item) => sum + LEVEL_SCORES[item.level], 0);
    const multiplier = CONTEXT_MULTIPLIERS[context] * STRICTNESS_MULTIPLIERS[strictness];
    return Math.min(100, Math.round(base * multiplier));
}
export function overallLevel(score) {
    if (score === 0)
        return "SAFE";
    if (score >= 40)
        return "CRITICAL";
    if (score >= 20)
        return "HIGH";
    if (score >= 10)
        return "MEDIUM";
    return "LOW";
}
export const RECOMMENDATIONS = {
    SAFE: "This message is safe to send.",
    LOW: "No major risk, but some sensitive details may be present. Confirm the recipient before sending.",
    MEDIUM: "Some personal information is included. Send only when necessary and only to a trusted recipient.",
    HIGH: "Information that can identify an individual is present. Strongly recommend removing it before sending.",
    CRITICAL: "Stop — do not send! This message contains information directly linked to financial fraud, identity theft, or doxxing.",
};
