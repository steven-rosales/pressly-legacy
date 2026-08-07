import {
  defineFeature,
  defineFoundation,
  defineModule,
  defineNamespace,
} from '../../../tooling/architecture/architecture-definition.factory.ts';

const workforceFeatureFoundations = [
  'language/workforce',
  'language/workforce-authority',
  'language/workforce-command',
  'language/workforce-failure',
] as const;

const workforceCoreFoundations = [
  'language/workforce',
  'language/workforce-command',
  'language/workforce-failure',
] as const;

const workforceInvitationCommandFoundations = [
  ...workforceFeatureFoundations,
  'language/workforce-invitation',
] as const;

const workforceInvitationListFoundations = [
  ...workforceCoreFoundations,
  'language/workforce-invitation',
  'language/workforce-pagination',
] as const;

const workforceInvitationPreviewFoundations = [
  ...workforceCoreFoundations,
  'language/workforce-invitation',
] as const;

const workforceMembershipCommandFoundations = [
  ...workforceFeatureFoundations,
  'language/workforce-membership',
] as const;

const workforceMembershipListFoundations = [
  ...workforceCoreFoundations,
  'language/workforce-membership',
  'language/workforce-pagination',
] as const;

const workforceSecurityFoundations = [
  ...workforceCoreFoundations,
  'language/workforce-pagination',
] as const;

const mfaHttpFoundations = [
  'language/mfa',
  'adapters/http/mfa-request',
  'adapters/postgres/database-operation',
] as const;

const workforceCommandPersistence = [
  'adapters/postgres/database-operation',
  'adapters/postgres/workforce-audit',
  'adapters/postgres/workforce-business-lock',
  'adapters/postgres/workforce-command-receipt',
] as const;

export default defineModule({
  id: 'security/identity',
  packageName: '@pressly/identity',
  features: defineNamespace({
    bootstrap: defineNamespace({
      'bootstrap-owner': defineFeature.headlessCommand({
        dependsOn: ['adapters/postgres/database-operation'],
      }),
    }),
    mfa: defineNamespace({
      'complete-mfa-challenge': defineFeature.httpCommand({
        dependsOn: [
          ...mfaHttpFoundations,
          'language/authentication-session',
          'adapters/postgres/role-read',
        ],
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
        dependsOn: [
          'adapters/http/mfa-request',
          'adapters/postgres/database-operation',
        ],
      }),
    }),
    sessions: defineNamespace({
      'list-identity-sessions': defineFeature.httpQuery({
        dependsOn: ['adapters/postgres/database-operation'],
      }),
      'revoke-identity-sessions': defineFeature.httpCommand({
        dependsOn: ['adapters/postgres/database-operation'],
      }),
      'load-session': defineFeature.httpQuery({
        dependsOn: [
          'adapters/http/authentication-request',
          'adapters/postgres/database-operation',
        ],
      }),
      login: defineFeature.httpCommand({
        dependsOn: [
          'language/authentication-session',
          'adapters/postgres/auth-audit',
          'adapters/postgres/database-operation',
          'adapters/postgres/role-read',
        ],
      }),
      'revoke-session': defineFeature.httpCommand({
        dependsOn: [
          'adapters/http/authentication-request',
          'adapters/postgres/auth-audit',
          'adapters/postgres/database-operation',
        ],
      }),
    }),
    workforce: defineNamespace({
      access: defineNamespace({
        'grant-workforce-access': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceFeatureFoundations,
            'language/access-grant',
            ...workforceCommandPersistence,
            'adapters/postgres/access-grant-read',
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-location-read',
            'adapters/postgres/workforce-member-read',
          ],
        }),
        'revoke-workforce-access': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceFeatureFoundations,
            'language/access-grant',
            ...workforceCommandPersistence,
            'adapters/postgres/access-grant-read',
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-member-read',
            'adapters/postgres/workforce-transition',
          ],
        }),
      }),
      invitations: defineNamespace({
        'accept-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceInvitationCommandFoundations,
            'ports/workforce-invitation-token',
            ...workforceCommandPersistence,
            'adapters/postgres/workforce-invitation-read',
            'adapters/postgres/workforce-transition',
          ],
        }),
        'issue-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceInvitationCommandFoundations,
            'ports/workforce-invitation-token',
            ...workforceCommandPersistence,
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-invitation-read',
            'adapters/postgres/workforce-location-read',
          ],
        }),
        'list-workforce-invitations': defineFeature.headlessQuery({
          dependsOn: [
            ...workforceInvitationListFoundations,
            'adapters/postgres/database-operation',
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-invitation-read',
          ],
        }),
        'preview-workforce-invitation': defineFeature.headlessQuery({
          dependsOn: [
            ...workforceInvitationPreviewFoundations,
            'ports/workforce-invitation-token',
            'adapters/postgres/database-operation',
            'adapters/postgres/workforce-business-lock',
            'adapters/postgres/workforce-transition',
          ],
        }),
        'reissue-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceInvitationCommandFoundations,
            'ports/workforce-invitation-token',
            ...workforceCommandPersistence,
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-invitation-read',
            'adapters/postgres/workforce-transition',
          ],
        }),
        'revoke-workforce-invitation': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceInvitationCommandFoundations,
            ...workforceCommandPersistence,
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-invitation-read',
            'adapters/postgres/workforce-transition',
          ],
        }),
      }),
      memberships: defineNamespace({
        'get-workforce-member': defineFeature.headlessQuery({
          dependsOn: [
            ...workforceMembershipCommandFoundations,
            'adapters/postgres/database-operation',
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-member-read',
          ],
        }),
        'list-workforce': defineFeature.headlessQuery({
          dependsOn: [
            ...workforceMembershipListFoundations,
            'adapters/postgres/database-operation',
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-member-read',
          ],
        }),
        'transition-workforce-membership': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceMembershipCommandFoundations,
            ...workforceCommandPersistence,
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-member-read',
            'adapters/postgres/workforce-transition',
          ],
        }),
      }),
      security: defineNamespace({
        'list-workforce-member-sessions': defineFeature.headlessQuery({
          dependsOn: [
            ...workforceFeatureFoundations,
            'adapters/postgres/database-operation',
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-member-read',
          ],
        }),
        'revoke-workforce-member-sessions': defineFeature.headlessCommand({
          dependsOn: [
            ...workforceFeatureFoundations,
            ...workforceCommandPersistence,
            'adapters/postgres/workforce-actor-read',
            'adapters/postgres/workforce-member-read',
          ],
        }),
        'list-workforce-security-events': defineFeature.headlessQuery({
          dependsOn: [
            ...workforceSecurityFoundations,
            'adapters/postgres/database-operation',
            'adapters/postgres/workforce-actor-read',
          ],
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
      'workforce-invitation-token': defineFoundation.port(),
    }),
    adapters: defineNamespace({
      http: defineNamespace({
        'authentication-request': defineFoundation.adapter(),
        'mfa-request': defineFoundation.adapter({
          dependsOn: ['language/mfa', 'adapters/http/authentication-request'],
        }),
      }),
      postgres: defineNamespace({
        'access-grant-read': defineFoundation.adapter({
          dependsOn: ['language/access-grant', 'language/workforce'],
        }),
        'auth-audit': defineFoundation.adapter({
          dependsOn: ['adapters/postgres/database-operation'],
        }),
        'database-operation': defineFoundation.adapter(),
        'role-read': defineFoundation.adapter(),
        'workforce-actor-read': defineFoundation.adapter({
          dependsOn: ['language/workforce', 'language/workforce-authority'],
        }),
        'workforce-audit': defineFoundation.adapter(),
        'workforce-business-lock': defineFoundation.adapter(),
        'workforce-command-receipt': defineFoundation.adapter(),
        'workforce-invitation-read': defineFoundation.adapter({
          dependsOn: ['language/workforce-invitation'],
        }),
        'workforce-location-read': defineFoundation.adapter(),
        'workforce-member-read': defineFoundation.adapter({
          dependsOn: [
            'language/workforce',
            'language/workforce-authority',
            'language/workforce-membership',
            'adapters/postgres/access-grant-read',
          ],
        }),
        'workforce-transition': defineFoundation.adapter(),
      }),
    }),
  },
});
