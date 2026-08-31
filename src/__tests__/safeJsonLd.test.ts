import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "@/lib/safeJsonLd";

describe("serializeJsonLd", () => {
  it("serializes normal objects cleanly", () => {
    const data = { "@context": "https://schema.org", "@type": "Course", name: "CS110" };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it("escapes '<' characters to prevent </script> breakout injection", () => {
    const malicious = {
      name: "</script><script>alert('xss')</script>",
      description: "Learn <b>HTML</b> & JavaScript <script>",
    };

    const serialized = serializeJsonLd(malicious);

    expect(serialized).not.toContain("<");
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
    expect(serialized).toContain("\\u003cb>HTML\\u003c/b>");

    // Decodes back to original content when parsed by JSON parser
    expect(JSON.parse(serialized)).toEqual(malicious);
  });
});
