import { controlManagementBoundaryRequirements } from '@pressly/experience-control/testing/management-boundaries';
import { controlManagementCellDeclarations } from '@pressly/experience-control/testing/assembly';

const projectionByOperation = Object.freeze({
  'control.list-customers.v1': 'listControlCustomers',
  'control.get-customer.v1': 'getControlCustomer',
  'control.create-customer.v1': 'createControlCustomer',
  'control.update-customer.v1': 'updateControlCustomer',
  'control.list-orders.v1': 'listControlOrders',
  'control.get-order.v1': 'getControlOrder',
  'control.create-order.v1': 'createControlOrder',
  'control.correct-order.v1': 'correctControlOrder',
  'control.list-members.v1': 'listControlMembers',
  'control.get-member.v1': 'getControlMember',
  'control.list-member-sessions.v1': 'listControlMemberSessions',
  'control.revoke-member-sessions.v1': 'revokeControlMemberSessions',
  'control.list-invitations.v1': 'listControlInvitations',
  'control.issue-invitation.v1': 'issueControlInvitation',
  'control.reissue-invitation.v1': 'reissueControlInvitation',
  'control.revoke-invitation.v1': 'revokeControlInvitation',
  'control.suspend-membership.v1': 'transitionControlMembership',
  'control.reactivate-membership.v1': 'transitionControlMembership',
  'control.end-membership.v1': 'transitionControlMembership',
  'control.grant-access.v1': 'grantControlAccess',
  'control.revoke-access.v1': 'revokeControlAccess',
  'control.list-security-events.v1': 'readControlSecurityEvents',
  'control.preview-invitation.v1': 'previewControlInvitation',
  'control.accept-new-invitation.v1': 'acceptControlInvitation',
  'control.accept-existing-invitation-password.v1': 'acceptControlInvitation',
  'control.accept-existing-invitation-mfa.v1': 'acceptControlInvitation',
  'control.accept-existing-invitation.v1': 'acceptControlInvitation',
} as const);

export type ControlManagementExperienceRoute = Readonly<{
  operationId: keyof typeof projectionByOperation;
  projection: (typeof projectionByOperation)[keyof typeof projectionByOperation];
  method: string;
  path: string;
  bodyLimit: string | null;
  profileId: string;
}>;

const profiles = new Map(
  controlManagementBoundaryRequirements.map((requirement) => [
    requirement.operationId,
    requirement.profile.id,
  ]),
);

export const controlManagementExperienceRoutes = Object.freeze(
  Object.values(controlManagementCellDeclarations).flatMap((declaration) =>
    declaration.surfaces.flatMap((surface) =>
      surface.kind === 'http'
        ? [
            Object.freeze({
              operationId: declaration.id as keyof typeof projectionByOperation,
              projection:
                projectionByOperation[
                  declaration.id as keyof typeof projectionByOperation
                ],
              method: surface.method,
              path: surface.path,
              bodyLimit: surface.bodyLimit,
              profileId: profiles.get(declaration.id) ?? '<missing>',
            }),
          ]
        : [],
    ),
  ),
);

export const verifyControlManagementExperience = () => {
  const issues: string[] = [];
  const ids = new Set<string>();
  const routes = new Set<string>();
  for (const route of controlManagementExperienceRoutes) {
    if (ids.has(route.operationId))
      issues.push(`Duplicate operation ID: ${route.operationId}`);
    ids.add(route.operationId);
    const binding = `${route.method} ${route.path}`;
    if (routes.has(binding)) issues.push(`Duplicate route: ${binding}`);
    routes.add(binding);
    if (route.profileId === '<missing>')
      issues.push(`Missing boundary profile: ${route.operationId}`);
  }
  const projections = new Set([
    'resolveControlAccess',
    ...controlManagementExperienceRoutes.map((route) =>
      String(route.projection),
    ),
  ]);
  if (projections.size !== 23)
    issues.push(
      `Expected 23 durable projections, found ${String(projections.size)}.`,
    );
  return Object.freeze({
    routeCount: controlManagementExperienceRoutes.length,
    targetOperationCount: ids.size,
    projectionCount: projections.size,
    issues: Object.freeze(issues),
  });
};
