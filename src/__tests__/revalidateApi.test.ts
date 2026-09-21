import { describe, it, expect, vi, beforeEach } from "vitest";
import { revalidatePath, revalidateTag } from "next/cache";
import { submitIndexNow } from "@/lib/indexNow";
import { dynamic, POST } from "@/app/api/revalidate/route";

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/indexNow", () => ({
  submitIndexNow: vi.fn(),
}));

describe("POST /api/revalidate Endpoint", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    vi.mocked(revalidateTag).mockReset();
    vi.mocked(revalidatePath).mockReset();
    vi.mocked(submitIndexNow)
      .mockReset()
      .mockImplementation(async (scope) => ({
        submitted: true,
        scope,
        urlCount: 1,
        status: 200,
      }));
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
    expect(submitIndexNow).toHaveBeenCalledWith("programs");
  });

  it("revalidates only program data for the explicit programs scope", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=programs", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    expect(revalidateTag).toHaveBeenCalledTimes(1);
    expect(revalidateTag).toHaveBeenCalledWith("program-data", "max");
    expect(revalidatePath).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledWith("/data-status");
    expect(await response.json()).toMatchObject({ paths: ["/data-status"] });
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

  it("revalidates transfer data and all transfer route paths for transfers scope", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=transfers", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.scope).toBe("transfers");
    expect(json.tags).toEqual(["transfer-data"]);
    expect(revalidateTag).toHaveBeenCalledWith("transfer-data", "max");
    // revalidateTransfers must flush all transfer route patterns plus the public coverage API
    expect(revalidatePath).toHaveBeenCalledWith("/transfers");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/subjects");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/subjects/[subject]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/organizations");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/organizations/[organization]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/levels");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/levels/[level]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/courses");
    expect(revalidatePath).toHaveBeenCalledWith("/transfers/courses/[courseNumber]", "page");
    expect(revalidatePath).toHaveBeenCalledWith("/api/v1/transfer-coverage");
    expect(json.paths).toHaveLength(10);
    expect(submitIndexNow).toHaveBeenCalledWith("transfers");
  });

  it("keeps successful revalidation non-fatal when IndexNow submission fails", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    vi.mocked(submitIndexNow).mockRejectedValueOnce(new Error("IndexNow unavailable"));

    const response = await POST(new Request("http://localhost/api/revalidate?scope=courses", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      revalidated: true,
      scope: "courses",
      indexNow: {
        submitted: false,
        scope: "courses",
        error: "submission_failed",
      },
    });
  });

  it("revalidates all tags and paths once for all scope", async () => {
    process.env.REVALIDATE_SECRET = "correct-secret-123";
    const response = await POST(new Request("http://localhost/api/revalidate?scope=all", {
      method: "POST", headers: { Authorization: "Bearer correct-secret-123" },
    }));

    expect(response.status).toBe(200);
    // 3 tags: program-data, catalog-data, transfer-data
    expect(revalidateTag).toHaveBeenCalledTimes(3);
    // 1 programs path + 2 courses paths + 10 transfer paths = 13 total revalidatePath calls
    expect(revalidatePath).toHaveBeenCalledTimes(13);
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
