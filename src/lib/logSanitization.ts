const SENSITIVE_PATTERNS = [
  /postgres(?:ql)?:\/\/[^\s@]+@[^\s/]+[^\s]*/gi,
  /bearer\s+[a-z0-9_\-\.]+/gi,
  /secret/gi,
  /password/gi,
  /authorization/gi,
];

export function sanitizeLogValue(val: unknown): unknown {
  if (typeof val === "string") {
    return SENSITIVE_PATTERNS.reduce((sanitized, pattern) => sanitized.replace(pattern, "[REDACTED]"), val);
  }
  if (typeof val === "object" && val !== null) {
    if (Array.isArray(val)) return val.map(sanitizeLogValue);
    const sanitizedObj: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
      const lowerKey = key.toLowerCase();
      sanitizedObj[key] = lowerKey.includes("secret") || lowerKey.includes("key") || lowerKey.includes("password") || lowerKey.includes("token") || lowerKey.includes("auth") || lowerKey.includes("postgres")
        ? "[REDACTED]"
        : sanitizeLogValue(value);
    }
    return sanitizedObj;
  }
  return val;
}

/** A detached, redacted copy suitable for logs and third-party error reporting. */
export function sanitizeError(error: unknown): Error {
  const original = error instanceof Error ? error : new Error(String(error));
  const safe = new Error(String(sanitizeLogValue(original.message)));
  safe.name = original.name;
  if (original.stack) safe.stack = String(sanitizeLogValue(original.stack));
  return safe;
}
