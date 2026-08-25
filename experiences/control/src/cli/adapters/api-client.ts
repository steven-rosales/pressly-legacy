import {
  cliLoginResultSchema,
  cliLogoutSchema,
  cliMfaEnrollmentSchema,
  cliMfaMutationSchema,
  cliRecoveryCodesSchema,
  cliSessionResultSchema,
  cliSessionSchema,
  pricingCatalogSchema,
  pricingPlanSchema,
  pricingPublishResultSchema,
} from "../contracts-v1.ts"
import type { AppError } from "@pressly/errors/app-error"
import {
  externalServiceError,
  validationError,
} from "@pressly/errors/factories"
import type {
  AdminCliAuthApi,
  AdminCliPricingApi,
  CliFailure,
} from "../model.ts"
import {
  appErrorFromApiFailure,
  decodeApiResponse,
  encodeJsonBody,
  responseTraceId,
} from "@pressly/http"
import type { z } from "zod"
import { cliFailureFromAppError, cliFailureFromUnknown } from "./outcome.ts"

export type AdminCliClient = Readonly<{
  auth: AdminCliAuthApi
  pricing: AdminCliPricingApi
  close: () => Promise<void>
}>

export type AdminCliClientFactory = (apiUrl: URL) => AdminCliClient
export type AdminCliFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export const readAdminApiUrl = (
  environment: Readonly<Record<string, string | undefined>>,
): URL => {
  const raw = environment["PRESSLY_API_URL"]?.trim() || "http://localhost:4000"
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw validationError({
      code: "invalid_api_url",
      message: "PRESSLY_API_URL is not a valid URL.",
      safeMessage: "PRESSLY_API_URL must be a valid URL.",
    })
  }

  if (url.username !== "" || url.password !== "")
    throw validationError({
      code: "api_url_credentials_forbidden",
      message: "PRESSLY_API_URL must not contain URL credentials.",
      safeMessage: "PRESSLY_API_URL must not contain credentials.",
    })

  const isHttps = url.protocol === "https:"
  const isExactLoopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  if (!isHttps && !(url.protocol === "http:" && isExactLoopback))
    throw validationError({
      code: "insecure_api_url",
      message:
        "PRESSLY_API_URL must use HTTPS; HTTP is permitted only for an exact loopback host.",
      safeMessage:
        "PRESSLY_API_URL must use HTTPS, except for local loopback development.",
    })

  return url
}

const invalidApiResponse = (input: {
  response: Response
  url: URL
  cause: unknown
}): AppError => {
  const traceId = responseTraceId(input.response.headers)
  return externalServiceError({
    code: "invalid_api_response",
    message: `API returned an invalid response for ${input.url.toString()}.`,
    safeMessage: "Pressly API returned an invalid response.",
    status: 502,
    cause: input.cause,
    details: { status: input.response.status, url: input.url.toString() },
    ...(traceId === undefined ? {} : { traceId }),
  })
}

const request = async <Value>(input: {
  apiUrl: URL
  path: string
  method: "GET" | "POST"
  schema: z.ZodType<Value>
  fetch: AdminCliFetch
  bearerToken?: string
  body?: unknown
}): Promise<
  | Readonly<{ kind: "success"; value: Value }>
  | Readonly<{ kind: "failure"; failure: CliFailure }>
> => {
  const url = new URL(input.path, input.apiUrl)
  const encoded =
    input.body === undefined ? undefined : encodeJsonBody(input.body)
  if (encoded?.tag === "rejected")
    return {
      kind: "failure",
      failure: cliFailureFromAppError(
        validationError({
          code: "cli_request_body_not_serializable",
          message: "The CLI request body cannot be encoded as JSON.",
          safeMessage: "The request contains unsupported data.",
          details: { reason: encoded.reason },
          ...(encoded.cause === undefined ? {} : { cause: encoded.cause }),
        }),
      ),
    }

  let response: Response
  try {
    response = await input.fetch(url, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(encoded === undefined
          ? {}
          : { "content-type": "application/json" }),
        ...(input.bearerToken === undefined
          ? {}
          : { authorization: `Bearer ${input.bearerToken}` }),
      },
      ...(encoded?.tag === "encoded" ? { body: encoded.body } : {}),
    })
  } catch (cause) {
    return {
      kind: "failure",
      failure: cliFailureFromAppError(
        externalServiceError({
          code: "api_request_failed",
          message: `Could not reach API at ${url.toString()}.`,
          safeMessage: "Could not reach the Pressly API.",
          status: 502,
          cause,
          details: { url: url.toString() },
        }),
      ),
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    return {
      kind: "failure",
      failure: cliFailureFromAppError(
        invalidApiResponse({ response, url, cause }),
      ),
    }
  }

  const decoded = decodeApiResponse(body, input.schema)
  if (!decoded.success)
    return {
      kind: "failure",
      failure: cliFailureFromAppError(
        invalidApiResponse({ response, url, cause: decoded.error }),
      ),
    }
  if (!decoded.data.ok)
    return {
      kind: "failure",
      failure: cliFailureFromAppError(
        appErrorFromApiFailure({
          failure: decoded.data,
          responseStatus: response.status,
          headers: response.headers,
        }),
      ),
    }
  if (!response.ok) {
    const traceId = responseTraceId(response.headers)
    return {
      kind: "failure",
      failure: cliFailureFromAppError(
        externalServiceError({
          code: "api_status_envelope_mismatch",
          message: `API returned HTTP ${String(response.status)} with a success envelope for ${url.toString()}.`,
          safeMessage: "Pressly API returned an invalid response.",
          status: 502,
          details: { status: response.status, url: url.toString() },
          ...(traceId === undefined ? {} : { traceId }),
        }),
      ),
    }
  }
  return Object.freeze({ kind: "success" as const, value: decoded.data.data })
}

export const makeAdminCliClientFactory =
  (fetch: AdminCliFetch): AdminCliClientFactory =>
  (apiUrl) => {
    const invoke = <Value>(
      input: Omit<Parameters<typeof request<Value>>[0], "apiUrl" | "fetch">,
    ) =>
      request({ ...input, apiUrl, fetch }).catch((error: unknown) => ({
        kind: "failure" as const,
        failure: cliFailureFromUnknown(error),
      }))

    const auth: AdminCliAuthApi = Object.freeze({
      login: (body) =>
        invoke({
          path: "/control/cli/auth/login",
          method: "POST",
          schema: cliLoginResultSchema,
          body,
        }),
      completeMfaChallenge: (body) =>
        invoke({
          path: "/control/cli/auth/mfa/challenge",
          method: "POST",
          schema: cliSessionSchema,
          body,
        }),
      loadSession: (bearerToken) =>
        invoke({
          path: "/control/cli/auth/session",
          method: "GET",
          schema: cliSessionResultSchema,
          bearerToken,
        }),
      logout: (bearerToken) =>
        invoke({
          path: "/control/cli/auth/logout",
          method: "POST",
          schema: cliLogoutSchema,
          bearerToken,
        }),
      beginMfaEnrollment: (bearerToken) =>
        invoke({
          path: "/control/cli/auth/mfa/enrollment",
          method: "POST",
          schema: cliMfaEnrollmentSchema,
          bearerToken,
        }),
      confirmMfaEnrollment: (bearerToken, code) =>
        invoke({
          path: "/control/cli/auth/mfa/enrollment/confirm",
          method: "POST",
          schema: cliRecoveryCodesSchema,
          bearerToken,
          body: { code },
        }),
      regenerateMfaRecoveryCodes: (bearerToken) =>
        invoke({
          path: "/control/cli/auth/mfa/recovery-codes/regenerate",
          method: "POST",
          schema: cliRecoveryCodesSchema,
          bearerToken,
        }),
      removeMfa: (bearerToken) =>
        invoke({
          path: "/control/cli/auth/mfa/remove",
          method: "POST",
          schema: cliMfaMutationSchema,
          bearerToken,
        }),
    })
    const pricing: AdminCliPricingApi = Object.freeze({
      loadCatalog: (bearerToken, serviceSlug) =>
        invoke({
          path: `/pricing/services/${encodeURIComponent(serviceSlug)}/pricing`,
          method: "GET",
          schema: pricingCatalogSchema,
          bearerToken,
        }) as ReturnType<AdminCliPricingApi["loadCatalog"]>,
      planChange: (bearerToken, body) =>
        invoke({
          path: "/pricing/changes/plan",
          method: "POST",
          schema: pricingPlanSchema,
          bearerToken,
          body,
        }),
      publishChange: (bearerToken, body) =>
        invoke({
          path: "/pricing/changes/publish",
          method: "POST",
          schema: pricingPublishResultSchema,
          bearerToken,
          body,
        }),
    })
    return Object.freeze({
      auth,
      pricing,
      close: async () => undefined,
    })
  }
