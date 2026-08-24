import {
  defineHttpBoundaryProfile,
  type HttpBoundaryProfile,
} from '@pressly/cells';
import {
  controlAuthBoundaryRequirements,
  controlCliAuthApiBoundaryRequirements,
  controlManagementBoundaryRequirements,
} from '@pressly/experience-control';
import { customerAuthBoundaryRequirements } from '@pressly/experience-customer';
import { processorAuthBoundaryRequirements } from '@pressly/experience-processor/server';
import {
  listDeadEventsOperationId,
  receiveCentsWebhookOperationId,
  replayDeadEventOperationId,
} from '@pressly/ingress-system';
import { orderManagementHttpBoundaryRequirements } from '@pressly/orders-system';
import {
  loadPricingCatalogOperationId,
  planPricingChangeOperationId,
  publishPricingChangeOperationId,
} from '@pressly/pricing-system';
import { bindHttpBoundaryProfile } from './src/public.ts';

type BoundaryRequirement = Readonly<{
  operationId: string;
  profile: HttpBoundaryProfile;
}>;

const ownerRequirements: readonly BoundaryRequirement[] = Object.freeze([
  ...customerAuthBoundaryRequirements,
  ...controlAuthBoundaryRequirements,
  ...controlCliAuthApiBoundaryRequirements,
  ...controlManagementBoundaryRequirements,
  ...processorAuthBoundaryRequirements,
  ...orderManagementHttpBoundaryRequirements,
]);

const operationProfileId = (operationId: string): string =>
  `${operationId.replaceAll('.', '-')}-http`;

const requiredJsonContentTypeFailure = Object.freeze({
  code: 'unsupported_media_type',
  safeMessage: 'This endpoint requires a JSON request body.',
});

const presslyRequestBody = (
  requestBody: HttpBoundaryProfile['requestBody'],
): HttpBoundaryProfile['requestBody'] =>
  requestBody === null
    ? null
    : {
        ...requestBody,
        ...(requestBody.contentType === 'required'
          ? { unsupportedContentType: requiredJsonContentTypeFailure }
          : {}),
      };

const ownerProfiles = Object.freeze(
  ownerRequirements.map(({ operationId, profile }) =>
    defineHttpBoundaryProfile({
      ...profile,
      id: operationProfileId(operationId),
      requestBody: presslyRequestBody(profile.requestBody),
    }),
  ),
);

const ownerBindings = Object.freeze(
  ownerRequirements.map(({ operationId }) =>
    bindHttpBoundaryProfile({
      operationId,
      profileId: operationProfileId(operationId),
    }),
  ),
);

const pricingPublicRead = defineHttpBoundaryProfile({
  id: 'api-pricing-public-read-v1',
  authentication: null,
  requestBody: {
    acceptedContentTypes: ['application/json'],
    contentType: 'parse-if-matching',
    parser: 'json-document-64kb',
    phase: 'before-authentication',
  },
  exactOrigin: null,
  csrf: null,
  requestRateLimit: null,
  identityRateLimit: null,
  inputValidationPhase: 'before-authentication',
  noStore: false,
  contextProviders: [],
  authorization: null,
  expectedFailureObservation: null,
});

const pricingChange = defineHttpBoundaryProfile({
  id: 'api-pricing-change-v1',
  authentication: { provider: 'bearer-session', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    contentType: 'required',
    unsupportedContentType: requiredJsonContentTypeFailure,
    parser: 'json-document',
    phase: 'before-authentication',
  },
  exactOrigin: null,
  csrf: null,
  requestRateLimit: null,
  identityRateLimit: null,
  inputValidationPhase: 'before-authentication',
  noStore: false,
  contextProviders: ['pricing-change-author'],
  authorization: 'access-policy',
  expectedFailureObservation: null,
});

const centsWebhook = defineHttpBoundaryProfile({
  id: 'api-cents-webhook-v1',
  authentication: { provider: 'cents-webhook', required: true },
  requestBody: {
    acceptedContentTypes: ['application/json'],
    contentType: 'required',
    unsupportedContentType: requiredJsonContentTypeFailure,
    parser: 'raw-document-256kb',
    phase: 'before-authentication',
  },
  exactOrigin: null,
  csrf: null,
  requestRateLimit: null,
  identityRateLimit: null,
  inputValidationPhase: 'after-authentication',
  noStore: false,
  contextProviders: [],
  authorization: null,
  expectedFailureObservation: null,
});

const ingressDeadEventRead = defineHttpBoundaryProfile({
  id: 'api-ingress-dead-event-read-v1',
  authentication: {
    provider: 'processor-cookie-or-bearer-session',
    required: true,
  },
  requestBody: null,
  exactOrigin: null,
  csrf: null,
  requestRateLimit: null,
  identityRateLimit: null,
  inputValidationPhase: 'after-authentication',
  noStore: false,
  contextProviders: [],
  authorization: 'access-policy',
  expectedFailureObservation: null,
});

const ingressDeadEventReplay = defineHttpBoundaryProfile({
  ...ingressDeadEventRead,
  id: 'api-ingress-dead-event-replay-v1',
  requestBody: {
    acceptedContentTypes: ['application/json'],
    contentType: 'required',
    unsupportedContentType: requiredJsonContentTypeFailure,
    parser: 'json-document',
    phase: 'after-authentication',
  },
});

const processorProductionProfile = (input: {
  id: string;
  body: 'after-authentication' | 'after-authorization' | null;
  contextProviders: readonly string[];
  authorization: boolean;
}): HttpBoundaryProfile =>
  defineHttpBoundaryProfile({
    id: input.id,
    authentication: {
      provider: 'processor-cookie-or-bearer-session',
      required: true,
    },
    requestBody:
      input.body === null
        ? null
        : {
            acceptedContentTypes: ['application/json'],
            contentType: 'parse-if-matching',
            parser: 'json-document',
            phase: input.body,
          },
    exactOrigin: null,
    csrf: null,
    requestRateLimit: null,
    identityRateLimit: null,
    inputValidationPhase:
      input.body === 'after-authorization'
        ? 'after-authorization'
        : 'after-authentication',
    noStore: false,
    contextProviders: input.contextProviders,
    authorization: input.authorization ? 'access-policy' : null,
    expectedFailureObservation: null,
  });

const processorProductionProfiles = Object.freeze({
  actorCommandAfterInput: processorProductionProfile({
    id: 'api-processor-production-actor-command-after-input-v1',
    body: 'after-authentication',
    contextProviders: ['authenticated-actor'],
    authorization: true,
  }),
  actorCommandBeforeInput: processorProductionProfile({
    id: 'api-processor-production-actor-command-before-input-v1',
    body: 'after-authorization',
    contextProviders: ['authenticated-actor'],
    authorization: true,
  }),
  bodylessAllowedLocations: processorProductionProfile({
    id: 'api-processor-production-bodyless-allowed-locations-v1',
    body: null,
    contextProviders: ['allowed-production-location-ids'],
    authorization: false,
  }),
  bodylessResource: processorProductionProfile({
    id: 'api-processor-production-bodyless-resource-v1',
    body: null,
    contextProviders: [],
    authorization: true,
  }),
  resourceCommand: processorProductionProfile({
    id: 'api-processor-production-resource-command-v1',
    body: 'after-authentication',
    contextProviders: [],
    authorization: true,
  }),
});

const bindOperations = (
  profile: HttpBoundaryProfile,
  operationIds: readonly string[],
) =>
  operationIds.map((operationId) =>
    bindHttpBoundaryProfile({ operationId, profileId: profile.id }),
  );

const processorProductionBindings = Object.freeze([
  ...bindOperations(processorProductionProfiles.bodylessAllowedLocations, [
    'production.list-locations.v1',
  ]),
  ...bindOperations(processorProductionProfiles.bodylessResource, [
    'processor.list-production-history-activity.v1',
    'processor.list-production-order-control.v1',
    'processor.load-production-board.v1',
    'processor.load-production-history-run.v1',
    'processor.load-production-workspace.v1',
    'processor.load-remaining-day-forecast.v1',
    'production.list-history-plans.v1',
    'production.list-history-runs.v1',
    'production.list-orders.v1',
    'production.load-schedule.v1',
  ]),
  ...bindOperations(processorProductionProfiles.resourceCommand, [
    'processor.preview-production-order-backlog.v1',
  ]),
  ...bindOperations(processorProductionProfiles.actorCommandBeforeInput, [
    'production.advance-stage.v1',
  ]),
  ...bindOperations(processorProductionProfiles.actorCommandAfterInput, [
    'production.accept-schedule.v1',
    'production.assign-stage-machines.v1',
    'production.change-admission.v1',
    'production.change-order-resolution.v1',
    'production.commit-order-backlog.v1',
    'production.commit-order-route.v1',
    'production.confirm-order-overtime.v1',
    'production.create-schedule.v1',
    'production.create-shift.v1',
    'production.freeze-batch-membership.v1',
    'production.place-order-automatically.v1',
    'production.place-order-exactly.v1',
    'production.preview-order-route.v1',
    'production.publish-scheduler-config.v1',
    'production.reconcile-batch-progress.v1',
    'production.record-order-intake.v1',
    'production.replace-shift-selection.v1',
    'production.set-order-priority.v1',
    'production.start-schedule.v1',
    'production.unfreeze-batch-membership.v1',
    'production.update-shift.v1',
  ]),
]);

export const presslyHttpBoundaryProfiles = Object.freeze([
  ...ownerProfiles,
  pricingPublicRead,
  pricingChange,
  centsWebhook,
  ingressDeadEventRead,
  ingressDeadEventReplay,
  ...Object.values(processorProductionProfiles),
]);

export const presslyHttpBoundaryBindings = Object.freeze([
  ...ownerBindings,
  bindHttpBoundaryProfile({
    operationId: loadPricingCatalogOperationId,
    profileId: pricingPublicRead.id,
  }),
  bindHttpBoundaryProfile({
    operationId: planPricingChangeOperationId,
    profileId: pricingChange.id,
  }),
  bindHttpBoundaryProfile({
    operationId: publishPricingChangeOperationId,
    profileId: pricingChange.id,
  }),
  bindHttpBoundaryProfile({
    operationId: receiveCentsWebhookOperationId,
    profileId: centsWebhook.id,
  }),
  bindHttpBoundaryProfile({
    operationId: listDeadEventsOperationId,
    profileId: ingressDeadEventRead.id,
  }),
  bindHttpBoundaryProfile({
    operationId: replayDeadEventOperationId,
    profileId: ingressDeadEventReplay.id,
  }),
  ...processorProductionBindings,
]);
