import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const workforceFeatureFoundations = [
  'language/workforce',
  'language/workforce-command',
  'language/workforce-failure',
] as const;

const workforceInvitationFoundations = [
  ...workforceFeatureFoundations,
  'language/workforce-invitation',
  'language/workforce-pagination',
  'ports/workforce-invitation-store',
] as const;

const workforceMembershipFoundations = [
  ...workforceFeatureFoundations,
  'language/workforce-membership',
  'language/workforce-pagination',
  'ports/workforce-membership-store',
] as const;

const workforceSecurityFoundations = [
  ...workforceFeatureFoundations,
  'language/workforce-pagination',
  'ports/workforce-security-store',
] as const;

const mfaHttpFoundations = [
  'language/mfa',
  'ports/mfa-store',
  'adapters/http/mfa-request',
] as const;

export default defineModule({
  id: 'security/identity',
  packageName: '@pressly/identity',
  features: defineNamespace({
    bootstrap: defineNamespace({
      'bootstrap-owner': defineFeature.headlessCommand({
        dependsOn: ['adapters/postgres/identity-store'],
      }),
    }),
    mfa: defineNamespace({
      'complete-mfa-challenge': defineFeature.httpCommand({
        dependsOn: [...mfaHttpFoundations, 'language/authentication-session'],
      }),
      'begin-mfa-enrollment': defineFeature.httpCommand({
        dependsOn: mfaHttpFoundations,
      }),
      'confirm-mfa-enrollment': defineFeature.httpCommand({
        dependsOn: mfaHttpFoundations,
      }),
      'regenerate-mfa-recovery-codes': defineFeature.httpCommand({
        dependsOn: mfaHttpFoundations,
      }),
      'remove-mfa': defineFeature.httpCommand({
        dependsOn: ['ports/mfa-store', 'adapters/http/mfa-request'],
      }),
    }),
    sessions: defineNamespace({
      'list-identity-sessions': defineFeature.httpQuery({
        dependsOn: ['ports/identity-session-store'],
      }),
      'revoke-identity-sessions': defineFeature.httpCommand({
        dependsOn: ['ports/identity-session-store'],
      }),
      'load-session': defineFeature.httpQuery({
        dependsOn: [
          'adapters/http/authentication-request',
          'adapters/postgres/identity-store',
        ],
      }),
      login: defineFeature.httpCommand({
        dependsOn: [
          'language/authentication-session',
          'adapters/postgres/identity-store',
        ],
      }),
      'revoke-session': defineFeature.httpCommand({
        dependsOn: [
          'adapters/http/authentication-request',
          'adapters/postgres/identity-store',
        ],
      }),
    }),
    workforce: defineNamespace({
      access: defineNamespace({
        'grant-workforce-access': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceFeatureFoundations,
            'language/access-grant',
            'ports/workforce-access-store',
          ],
        }),
        'revoke-workforce-access': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceFeatureFoundations,
            'ports/workforce-access-store',
          ],
        }),
      }),
      invitations: defineNamespace({
        'accept-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: workforceInvitationFoundations,
        }),
        'issue-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: workforceInvitationFoundations,
        }),
        'list-workforce-invitations': defineFeature.headlessQuery({
          dependsOn: workforceInvitationFoundations,
        }),
        'preview-workforce-invitation': defineFeature.headlessQuery({
          dependsOn: workforceInvitationFoundations,
        }),
        'reissue-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: workforceInvitationFoundations,
        }),
        'revoke-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: workforceInvitationFoundations,
        }),
      }),
      memberships: defineNamespace({
        'get-workforce-member': defineFeature.headlessQuery({
          dependsOn: workforceMembershipFoundations,
        }),
        'list-workforce': defineFeature.headlessQuery({
          dependsOn: workforceMembershipFoundations,
        }),
        'transition-workforce-membership': defineFeature.headlessCommand({
          dependsOn: workforceMembershipFoundations,
        }),
      }),
      security: defineNamespace({
        'list-workforce-member-sessions': defineFeature.headlessQuery({
          dependsOn: workforceSecurityFoundations,
        }),
        'revoke-workforce-member-sessions': defineFeature.headlessCommand({
          dependsOn: workforceSecurityFoundations,
        }),
        'list-workforce-security-events': defineFeature.headlessQuery({
          dependsOn: workforceSecurityFoundations,
        }),
      }),
    }),
  }),
  foundations: {
    language: defineNamespace({
      'access-grant': defineFoundation.language({
        dependsOn: ['language/workforce'],
      }),
      'authentication-session': defineFoundation.language(),
      mfa: defineFoundation.language(),
      workforce: defineFoundation.language(),
      'workforce-authority': defineFoundation.language({
        dependsOn: ['language/workforce', 'language/workforce-membership'],
      }),
      'workforce-command': defineFoundation.language({
        dependsOn: ['language/workforce', 'language/workforce-failure'],
      }),
      'workforce-failure': defineFoundation.language({
        dependsOn: ['language/workforce'],
      }),
      'workforce-invitation': defineFoundation.language({
        dependsOn: ['language/workforce'],
      }),
      'workforce-membership': defineFoundation.language({
        dependsOn: ['language/access-grant'],
      }),
      'workforce-pagination': defineFoundation.language({
        dependsOn: ['language/workforce-command', 'language/workforce-failure'],
      }),
    }),
    ports: defineNamespace({
      'identity-session-store': defineFoundation.port(),
      'mfa-store': defineFoundation.port(),
      'workforce-access-store': defineFoundation.port({
        dependsOn: ['language/access-grant', 'language/workforce'],
      }),
      'workforce-invitation-store': defineFoundation.port({
        dependsOn: [
          'language/workforce',
          'language/workforce-invitation',
          'language/workforce-pagination',
        ],
      }),
      'workforce-membership-store': defineFoundation.port({
        dependsOn: [
          'language/workforce',
          'language/workforce-membership',
          'language/workforce-pagination',
        ],
      }),
      'workforce-security-store': defineFoundation.port({
        dependsOn: ['language/workforce', 'language/workforce-pagination'],
      }),
    }),
    adapters: defineNamespace({
      http: defineNamespace({
        'authentication-request': defineFoundation.adapter(),
        'mfa-request': defineFoundation.adapter({
          dependsOn: ['language/mfa', 'adapters/http/authentication-request'],
        }),
      }),
      postgres: defineNamespace({
        'identity-store': defineFoundation.adapter({
          dependsOn: [
            'language/access-grant',
            'language/workforce',
            'language/workforce-authority',
            'language/workforce-membership',
          ],
        }),
        'identity-session-store': defineFoundation.adapter({
          dependsOn: [
            'ports/identity-session-store',
            'adapters/postgres/identity-store',
          ],
        }),
        'mfa-store': defineFoundation.adapter({
          dependsOn: ['ports/mfa-store', 'adapters/postgres/identity-store'],
        }),
        'workforce-access-store': defineFoundation.adapter({
          dependsOn: [
            'language/access-grant',
            'language/workforce-authority',
            'ports/workforce-access-store',
            'adapters/postgres/identity-store',
          ],
        }),
        'workforce-invitation-store': defineFoundation.adapter({
          dependsOn: [
            'language/workforce',
            'language/workforce-authority',
            'language/workforce-command',
            'language/workforce-invitation',
            'language/workforce-pagination',
            'ports/workforce-invitation-store',
            'adapters/postgres/identity-store',
          ],
        }),
        'workforce-membership-store': defineFoundation.adapter({
          dependsOn: [
            'language/workforce-authority',
            'language/workforce-membership',
            'language/workforce-pagination',
            'ports/workforce-membership-store',
            'adapters/postgres/identity-store',
          ],
        }),
        'workforce-security-store': defineFoundation.adapter({
          dependsOn: [
            'language/workforce-authority',
            'language/workforce-membership',
            'language/workforce-pagination',
            'ports/workforce-security-store',
            'adapters/postgres/identity-store',
          ],
        }),
      }),
    }),
  },
});
