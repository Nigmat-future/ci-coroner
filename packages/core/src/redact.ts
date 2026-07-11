const PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  {
    re: /(Authorization:\s*Bearer\s+)(\S+)/gi,
    replacement: "$1[REDACTED]",
  },
  {
    re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED]",
  },
  {
    re: /\b(sk-[A-Za-z0-9]{20,})\b/g,
    replacement: "[REDACTED]",
  },
  {
    re: /(AWS_SECRET_ACCESS_KEY\s*=\s*)(\S+)/gi,
    replacement: "$1[REDACTED]",
  },
  {
    re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    replacement: "[REDACTED_PRIVATE_KEY]",
  },
  {
    re: /(api[_-]?key\s*[:=]\s*)([^\s'"]+)/gi,
    replacement: "$1[REDACTED]",
  },
];

export function redactSecrets(text: string): string {
  let out = text;
  for (const { re, replacement } of PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}
