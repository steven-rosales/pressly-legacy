import { z } from "zod"
import { describe, expect, it, vi } from "vitest"
import { makeFetchRequestAdapter } from "@/adapters/api/fetch-request.adapter"
import { RequestFailure } from "@/ports/request.error"

describe("processor request boundary", () => {
  it("uses same-origin cookies and adds the in-memory CSRF proof only to unsafe methods", async () => {
    const fetcher = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ ok: true, data: { version: 2 } }), {
          status: 200,
        })
    )
    const request = makeFetchRequestAdapter({
      baseUrl: "/api/",
      readCsrfToken: () => "csrf-proof",
      fetch: fetcher,
    })

    await request(
      { method: "POST", path: "/work", body: { value: 1 } },
      z.object({ version: z.number() })
    )
    await request({ path: "/work" }, z.object({ version: z.number() }))

    expect(fetcher).toHaveBeenNthCalledWith(
      1,
      "/api/work",
      expect.objectContaining({
        credentials: "same-origin",
        headers: expect.objectContaining({ "X-CSRF-Token": "csrf-proof" }),
      })
    )
    expect(fetcher.mock.calls[1]![1].headers).not.toHaveProperty("X-CSRF-Token")
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain("Authorization")
  })

  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [409, "conflict"],
    [503, "unavailable"],
  ] as const)("normalizes HTTP %i as %s", async (status, kind) => {
    const unauthorized = vi.fn()
    const request = makeFetchRequestAdapter({
      baseUrl: "",
      readCsrfToken: () => null,
      onUnauthorized: unauthorized,
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: { code: "EXPECTED", message: "Expected failure" },
          }),
          { status }
        )
      ),
    })

    await expect(request({ path: "/work" }, z.string())).rejects.toMatchObject({
      kind,
      code: "EXPECTED",
    } satisfies Partial<RequestFailure>)
    expect(unauthorized).toHaveBeenCalledTimes(status === 401 ? 1 : 0)
  })

  it("rejects data that violates the response contract", async () => {
    const request = makeFetchRequestAdapter({
      baseUrl: "",
      readCsrfToken: () => null,
      fetch: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, data: { version: "two" } }), {
          status: 200,
        })
      ),
    })

    await expect(
      request({ path: "/work" }, z.object({ version: z.number() }))
    ).rejects.toMatchObject({ kind: "invalid_response" })
  })

  it("retains the API request and trace references for the operator and observer", async () => {
    const onFailure = vi.fn()
    const request = makeFetchRequestAdapter({
      baseUrl: "",
      readCsrfToken: () => null,
      onFailure,
      fetch: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: false,
            error: {
              code: "UNEXPECTED",
              message: "The action could not be completed.",
              traceId: "trace-server-9",
            },
          }),
          {
            status: 500,
            headers: { "X-Request-Id": "request-edge-4" },
          }
        )
      ),
    })

    await expect(request({ path: "/work" }, z.string())).rejects.toMatchObject({
      requestId: "request-edge-4",
      traceId: "trace-server-9",
      referenceId: "trace-server-9",
      message: "The action could not be completed. Reference: trace-server-9",
    } satisfies Partial<RequestFailure>)
    expect(onFailure).toHaveBeenCalledWith(
      expect.objectContaining({ referenceId: "trace-server-9" }),
      { method: "GET", path: "/work" }
    )
  })

  it("preserves cancellation without reporting it as a service failure", async () => {
    const onFailure = vi.fn()
    const controller = new AbortController()
    controller.abort()
    const aborted = new DOMException("Cancelled", "AbortError")
    const request = makeFetchRequestAdapter({
      baseUrl: "",
      readCsrfToken: () => null,
      onFailure,
      fetch: vi.fn().mockRejectedValue(aborted),
    })

    await expect(
      request({ path: "/work", signal: controller.signal }, z.string())
    ).rejects.toBe(aborted)
    expect(onFailure).not.toHaveBeenCalled()
  })
})
