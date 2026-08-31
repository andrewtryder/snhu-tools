/**
 * Serialize JSON-LD for embedding in a <script> tag without breaking out via </script>.
 * Replaces '<' with unicode escape '\u003c'.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
