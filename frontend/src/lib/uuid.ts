/**
 * Random ID that works on plain http:// pages too.
 * crypto.randomUUID() exists only in secure contexts (https or localhost),
 * so it throws on http://<server-ip>. getRandomValues works everywhere.
 */
export function randomId(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID().replaceAll("-", "");
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
