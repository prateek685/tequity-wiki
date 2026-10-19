import { CSRF_HEADER, meResponse } from "@portal/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiGet, apiSend, errorMessage } from "./api";

const me = {
  id: "7b0e7c2a-3f1c-4c6a-9a51-1d2b3c4d5e6f",
  email: "a@company.com",
  name: "A",
  role: "admin",
  status: "active",
};

function mockFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(new Response(body === undefined ? null : JSON.stringify(body), { status })),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("calls the same-origin API with the CSRF header and validates the response", async () => {
    const fetchMock = mockFetch(200, me);
    await expect(apiGet("/me", meResponse)).resolves.toEqual(me);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/me");
    expect(init.credentials).toBe("same-origin");
    expect((init.headers as Record<string, string>)[CSRF_HEADER]).toBe("1");
  });

  it("rejects a response that doesn't match the contract", async () => {
    mockFetch(200, { ...me, role: "owner" });
    await expect(apiGet("/me", meResponse)).rejects.toThrow();
  });

  it("turns API errors into a typed ApiError with the API's message", async () => {
    mockFetch(422, { code: "LAST_ADMIN", message: "At least one active admin must remain." });
    const error: unknown = await apiSend("PATCH", "/admin/users/x", {}).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe("LAST_ADMIN");
    expect(errorMessage(error)).toBe("At least one active admin must remain.");
  });

  it("never shows raw server output when the error body is not ours", async () => {
    mockFetch(502, { stack: "Error at line 3" });
    const error: unknown = await apiGet("/me", meResponse).catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("INTERNAL");
    expect(errorMessage(error)).toBe("Something went wrong. Nothing was changed.");
  });

  it("returns nothing for 204 responses", async () => {
    mockFetch(204, undefined);
    await expect(apiSend("POST", "/auth/logout")).resolves.toBeUndefined();
  });
});
