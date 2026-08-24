import {
  makeControlAuthenticationBrowserClient,
  makeControlCustomersBrowserClient,
  makeControlInvitationsBrowserClient,
  makeControlOrdersBrowserClient,
  makeControlSecurityBrowserClient,
  makeControlWorkforceBrowserClient,
  makeControlBrowserRequestTransport,
  type ControlBrowserHttpClient,
} from '@pressly/experience-control/browser';

export type ControlBrowserOperationBindings = Readonly<{
  authentication: Parameters<
    typeof makeControlAuthenticationBrowserClient
  >[0]['operations'];
  security: Parameters<
    typeof makeControlSecurityBrowserClient
  >[0]['operations'];
  workforce: Parameters<
    typeof makeControlWorkforceBrowserClient
  >[0]['operations'];
  invitations: Parameters<
    typeof makeControlInvitationsBrowserClient
  >[0]['operations'];
  customers: Parameters<
    typeof makeControlCustomersBrowserClient
  >[0]['operations'];
  orders: Parameters<typeof makeControlOrdersBrowserClient>[0]['operations'];
}>;

export const makeControlBrowserClients = (
  input: Readonly<{
    client: ControlBrowserHttpClient;
    idempotencyKey: () => string;
    operations: ControlBrowserOperationBindings;
  }>,
) => {
  const request = makeControlBrowserRequestTransport(input.client);
  const authentication = makeControlAuthenticationBrowserClient({
    operations: input.operations.authentication,
    request,
    acceptCsrfToken: input.client.acceptCsrfToken,
    clearCsrfToken: input.client.clearCsrfToken,
  });
  const securityEvents = makeControlSecurityBrowserClient({
    operations: input.operations.security,
    request,
  });

  return Object.freeze({
    authentication,
    team: makeControlWorkforceBrowserClient({
      operations: input.operations.workforce,
      request,
      idempotencyKey: input.idempotencyKey,
    }),
    security: Object.freeze({
      beginMfaEnrollment: authentication.beginMfaEnrollment,
      confirmMfaEnrollment: authentication.confirmMfaEnrollment,
      regenerateRecoveryCodes: authentication.regenerateRecoveryCodes,
      removeMfa: authentication.removeMfa,
      listSecurityEvents: securityEvents.listSecurityEvents,
    }),
    invitations: makeControlInvitationsBrowserClient({
      operations: input.operations.invitations,
      request,
      acceptCsrfToken: input.client.acceptCsrfToken,
    }),
    customers: makeControlCustomersBrowserClient({
      operations: input.operations.customers,
      request,
      idempotencyKey: input.idempotencyKey,
    }),
    orders: makeControlOrdersBrowserClient({
      operations: input.operations.orders,
      request,
      idempotencyKey: input.idempotencyKey,
    }),
  });
};
