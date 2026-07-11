import { describe, it, expect } from "vitest";
import { redactSecrets } from "./redact.js";

describe("redactSecrets", () => {
  it("redacts bearer tokens", () => {
    const input = "Authorization: Bearer ghp_abcdefghijklmnopqrstuvwx";
    const out = redactSecrets(input);
    expect(out).not.toContain("ghp_");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts aws-like keys", () => {
    const input =
      "AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED]");
    expect(out).not.toContain("wJalrXUtnFEMI");
  });

  it("redacts private key blocks", () => {
    const input =
      "-----BEGIN PRIVATE KEY-----\nABCDEF\n-----END PRIVATE KEY-----";
    const out = redactSecrets(input);
    expect(out).toContain("[REDACTED_PRIVATE_KEY]");
    expect(out).not.toContain("ABCDEF");
  });

  it("leaves normal logs intact", () => {
    const input = "Error: Cannot find module 'left-pad'";
    expect(redactSecrets(input)).toBe(input);
  });
});
