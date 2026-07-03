/**
 * Masks a string by replacing middle characters with asterisks.
 * keepFirst=2, keepLast=0 on "abcdef" → "ab****"
 */
export function maskString(value: string, keepFirst = 2, keepLast = 0): string {
  if (value.length <= keepFirst + keepLast) return "*".repeat(value.length);
  const stars = "*".repeat(value.length - keepFirst - keepLast);
  return (
    value.slice(0, keepFirst) +
    stars +
    (keepLast > 0 ? value.slice(-keepLast) : "")
  );
}
