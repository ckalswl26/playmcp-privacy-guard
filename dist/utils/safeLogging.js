// Fields that may contain raw PII — always redacted in logs
const SENSITIVE_FIELDS = new Set([
    "message",
    "text",
    "content",
    "body",
    "raw",
    "original",
    "messages",
    "input",
]);
function sanitizeMeta(meta) {
    if (!meta)
        return {};
    const result = {};
    for (const [k, v] of Object.entries(meta)) {
        result[k] = SENSITIVE_FIELDS.has(k.toLowerCase()) ? "[REDACTED]" : v;
    }
    return result;
}
export function safeLog(level, message, meta) {
    const entry = JSON.stringify({
        level,
        message,
        ...sanitizeMeta(meta),
        ts: new Date().toISOString(),
    });
    process.stderr.write(entry + "\n");
}
