import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath, revalidateTag } from "next/cache";
import { dynamic, POST } from "@/app/api/revalidate/route";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

describe("POST /api/revalidate Endpoint", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.mocked(revalidateTag).mockReset();
    vi.mocked(revalidatePath).mockReset();
  });

  it("runs dynamically so the deployed secret is read at request time", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("fails 500 when REVALIDATE_SECRET is missing from environment", async () => {
    delete process.env.REVALIDATE_SECRET;

    const request = new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { Authorization: "Bearer test-secret" },
    });

    const response = await POST(request);
    expect(response.status).toBe(500);

    const json = await response.json();
    expect(json.error).toContain("REVALIDATE_SECRET is missing");
  });

  it("fails 401 unauthorized when Bearer secret token is invalid or missing", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";

    const request1 = new Request("http://localhost/api/revalidate", { method: "POST" });
    const response1 = await POST(request1);
    expect(response1.status).toBe(401);

    const request2 = new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { Authorization: "Bearer wrong-secret" },
    });
    const response2 = await POST(request2);
    expect(response2.status).toBe(401);
  });

  it("defaults to programs scope for backward-compatible callers", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";

    const request = new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { Authorization: "Bearer correct-secret-123" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.revalidated).toBe(true);
    expect(json.scope).toBe("programs");
    expect(json.tags).toEqual(["program-data"]);
    expect(revalidateTag).toHaveBeenCalledWith("program-data", "max");
    expect(revalidateTag).not.toHaveBeenCalledWith("catalog-data", "max");
    expect(revalidateTag).not.toHaveBeenCalledWith("transfer-data", "max");
  });

  it("revalidates only program data for the explicit programs scope", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=programs", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("program-data", "max");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts the dedicated revalidation header", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";

    const request = new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "x-revalidate-secret": "correct-secret-123" },
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
  });

  it("revalidates only the selected courses scope and its canonical routes", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=courses", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scope: "courses", tags: ["catalog-data"], paths: ["/courses", "/courses/[id]"] });
    expect(revalidateTag).toHaveBeenCalledWith("catalog-data", "max");
    expect(revalidatePath).toHaveBeenCalledWith("/courses");
    expect(revalidatePath).toHaveBeenCalledWith("/courses/[id]", "page");
  });

  it("revalidates only transfer data for transfers scope", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=transfers", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledWith("transfer-data", "max");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("revalidates all tags and Courses paths once for all scope", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=all", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    expect(revalidatePath).toHaveBeenCalledTimes(2);
  });

  it("rejects unknown scopes before invalidating caches", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=banana", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("does not expose internal revalidation failures", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    vi.mocked(revalidateTag).mockImplementation(() => { throw new Error("internal details"); });
    const response = await POST(new Request("http://localhost/api/revalidate", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Revalidation failed." });
  });
});
