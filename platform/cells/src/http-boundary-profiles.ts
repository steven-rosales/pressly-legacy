export type HttpBoundaryParserPhase =
  | 'after-authentication'
  | 'after-authorization'
  | 'before-authentication';

export type HttpBoundaryInputValidationPhase =
  | 'after-authentication'
  | 'after-authorization'
  | 'before-authentication';

export type HttpBoundaryAuthentication = Readonly<{
  provider: string;
  required: boolean;
}>;

export type HttpBoundaryContentTypePolicy = 'parse-if-matching' | 'required';

export type HttpBoundaryUnsupportedContentTypeFailure = Readonly<{
  code: string;
  safeMessage: string;
}>;

export type HttpBoundaryRequestBody = Readonly<{
  acceptedContentTypes: readonly string[];
  /** Defaults to required for profiles authored before conditional parsing. */
  contentType?: HttpBoundaryContentTypePolicy;
  /** Optional wire-safe 415 presentation selected by deployment topology. */
  unsupportedContentType?: HttpBoundaryUnsupportedContentTypeFailure;
  parser: string;
  phase: HttpBoundaryParserPhase;
}>;

/**
 * Business-neutral HTTP policy selected by deployment topology.
 *
 * Provider tokens are opaque to cells and the generic host. The process edge
 * resolves them to concrete request limiting, parsing, validation,
 * authentication, origin, CSRF, identity limiting, context, and
 * authorization mechanisms.
 */
export type HttpBoundaryProfile = Readonly<{
  id: string;
  authentication: HttpBoundaryAuthentication | null;
  requestBody: HttpBoundaryRequestBody | null;
  exactOrigin: string | null;
  csrf: string | null;
  requestRateLimit: string | null;
  identityRateLimit: string | null;
  inputValidationPhase: HttpBoundaryInputValidationPhase;
  noStore: boolean;
  contextProviders: readonly string[];
  authorization: string | null;
  /** Opaque process-edge observer for cell failures presented as responses. */
  expectedFailureObservation?: string | null;
}>;

export const defineHttpBoundaryProfile = (
  definition: HttpBoundaryProfile,
): HttpBoundaryProfile =>
  Object.freeze({
    id: definition.id,
    authentication:
      definition.authentication === null
        ? null
        : Object.freeze({ ...definition.authentication }),
    requestBody:
      definition.requestBody === null
        ? null
        : Object.freeze({
            ...definition.requestBody,
            contentType: definition.requestBody.contentType ?? 'required',
            ...(definition.requestBody.unsupportedContentType === undefined
              ? {}
              : {
                  unsupportedContentType: Object.freeze({
                    ...definition.requestBody.unsupportedContentType,
                  }),
                }),
            acceptedContentTypes: Object.freeze([
              ...definition.requestBody.acceptedContentTypes,
            ]),
          }),
    exactOrigin: definition.exactOrigin,
    csrf: definition.csrf,
    requestRateLimit: definition.requestRateLimit,
    identityRateLimit: definition.identityRateLimit,
    inputValidationPhase: definition.inputValidationPhase,
    noStore: definition.noStore,
    contextProviders: Object.freeze([...definition.contextProviders]),
    authorization: definition.authorization,
    expectedFailureObservation: definition.expectedFailureObservation ?? null,
  });

export type HttpBoundaryProfilesByOperation = Readonly<
  Record<string, HttpBoundaryProfile>
>;
