/* This file is generated from the checked deployment topology. */
import { defineArchitectureMap } from '@pressly/cells';

export const architectureMap = defineArchitectureMap({
  topologyId: 'pressly',
  features: [
    {
      id: 'control.authentication',
      experience: 'control',
      path: 'experiences/control/src/features/authentication/feature.ts',
      uses: [
        'control.auth-login.v1',
        'control.complete-mfa-challenge.v1',
        'control.load-auth-session.v1',
        'control.logout.v1',
      ],
      stateProofs: [
        'experiences/control/src/features/authentication/use-authentication.test.tsx',
      ],
      componentProofs: [
        'experiences/control/src/features/authentication/authentication-view.test.tsx',
      ],
    },
    {
      id: 'control.configuration',
      experience: 'control',
      path: 'experiences/control/src/features/configuration/feature.ts',
      uses: [],
      stateProofs: [
        'experiences/control/src/features/configuration/configuration-workspace.test.tsx',
      ],
      componentProofs: [
        'experiences/control/src/features/configuration/configuration-workspace.test.tsx',
      ],
    },
    {
      id: 'control.customers',
      experience: 'control',
      path: 'experiences/control/src/features/customers/feature.ts',
      uses: [
        'control.create-customer.v1',
        'control.get-customer.v1',
        'control.list-customers.v1',
        'control.update-customer.v1',
      ],
      stateProofs: [
        'experiences/control/src/features/customers/customer-workspace.test.tsx',
      ],
      componentProofs: [
        'experiences/control/src/features/customers/customer-workspace.test.tsx',
      ],
    },
    {
      id: 'control.orders',
      experience: 'control',
      path: 'experiences/control/src/features/orders/feature.ts',
      uses: [
        'control.correct-order.v1',
        'control.create-order.v1',
        'control.get-order.v1',
        'control.list-customers.v1',
        'control.list-orders.v1',
      ],
      stateProofs: [
        'experiences/control/src/features/orders/order-workspace.test.tsx',
      ],
      componentProofs: [
        'experiences/control/src/features/orders/order-workspace.test.tsx',
      ],
    },
    {
      id: 'control.security',
      experience: 'control',
      path: 'experiences/control/src/features/security/feature.ts',
      uses: [
        'control.begin-mfa-enrollment.v1',
        'control.confirm-mfa-enrollment.v1',
        'control.list-identity-sessions.v1',
        'control.list-security-events.v1',
        'control.regenerate-mfa-recovery-codes.v1',
        'control.remove-mfa.v1',
        'control.revoke-all-identity-sessions.v1',
        'control.revoke-identity-session.v1',
      ],
      stateProofs: [
        'experiences/control/src/features/security/security-workspace.test.tsx',
      ],
      componentProofs: [
        'experiences/control/src/features/security/security-workspace.test.tsx',
      ],
    },
    {
      id: 'control.team',
      experience: 'control',
      path: 'experiences/control/src/features/team/feature.ts',
      uses: [
        'control.accept-existing-invitation-mfa.v1',
        'control.accept-existing-invitation-password.v1',
        'control.accept-existing-invitation.v1',
        'control.accept-new-invitation.v1',
        'control.end-membership.v1',
        'control.get-member.v1',
        'control.grant-access.v1',
        'control.issue-invitation.v1',
        'control.list-invitations.v1',
        'control.list-member-sessions.v1',
        'control.list-members.v1',
        'control.preview-invitation.v1',
        'control.reactivate-membership.v1',
        'control.reissue-invitation.v1',
        'control.revoke-access.v1',
        'control.revoke-invitation.v1',
        'control.revoke-member-sessions.v1',
        'control.suspend-membership.v1',
      ],
      stateProofs: [
        'experiences/control/src/features/team/team-workspace.test.tsx',
        'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
      ],
      componentProofs: [
        'experiences/control/src/features/team/team-workspace.test.tsx',
        'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
      ],
    },
    {
      id: 'customer.web.order-entry',
      experience: 'customer',
      path: 'experiences/customer/src/web/features/order-entry/feature.ts',
      uses: [],
      stateProofs: [
        'experiences/customer/src/web/features/order-entry/SchedulePickupButton.test.tsx',
      ],
      componentProofs: [
        'experiences/customer/src/web/features/order-entry/SchedulePickupButton.test.tsx',
      ],
    },
    {
      id: 'customer.web.pricing',
      experience: 'customer',
      path: 'experiences/customer/src/web/features/pricing/feature.ts',
      uses: ['pricing.load-pricing-catalog.v1'],
      stateProofs: [
        'experiences/customer/src/web/features/pricing/pricing-interaction.test.tsx',
      ],
      componentProofs: [
        'experiences/customer/src/web/features/pricing/pricing-interaction.test.tsx',
      ],
    },
    {
      id: 'processor.authentication',
      experience: 'processor',
      path: 'experiences/processor/src/features/authentication/feature.ts',
      uses: [
        'processor.auth-login.v1',
        'processor.complete-mfa-challenge.v1',
        'processor.load-auth-session.v1',
        'processor.logout.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/authentication/authentication.view.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/authentication/authentication.view.test.tsx',
      ],
    },
    {
      id: 'processor.forecast',
      experience: 'processor',
      path: 'experiences/processor/src/features/forecast/feature.ts',
      uses: ['processor.load-remaining-day-forecast.v1'],
      stateProofs: [
        'experiences/processor/src/features/forecast/forecast.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/forecast/forecast.test.tsx',
      ],
    },
    {
      id: 'processor.history',
      experience: 'processor',
      path: 'experiences/processor/src/features/history/feature.ts',
      uses: [
        'processor.list-production-history-activity.v1',
        'processor.load-production-history-run.v1',
        'production.list-history-plans.v1',
        'production.list-history-runs.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/history/history-workspace.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/history/history-workspace.test.tsx',
      ],
    },
    {
      id: 'processor.intake',
      experience: 'processor',
      path: 'experiences/processor/src/features/intake/feature.ts',
      uses: [
        'processor.list-production-order-control.v1',
        'production.change-admission.v1',
        'production.record-order-intake.v1',
        'production.set-order-priority.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/intake/intake.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/intake/intake.test.tsx',
      ],
    },
    {
      id: 'processor.location-selection',
      experience: 'processor',
      path: 'experiences/processor/src/features/location-selection/feature.ts',
      uses: ['production.list-locations.v1'],
      stateProofs: [
        'experiences/processor/src/features/location-selection/location-selection.view.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/location-selection/location-selection.view.test.tsx',
      ],
    },
    {
      id: 'processor.order-control',
      experience: 'processor',
      path: 'experiences/processor/src/features/order-control/feature.ts',
      uses: [
        'orders.accept-incoming-order-proposal.v1',
        'orders.list-incoming-order-proposals.v1',
        'orders.reject-incoming-order-proposal.v1',
        'orders.restore-incoming-order-proposal.v1',
        'processor.list-production-order-control.v1',
        'production.commit-order-route.v1',
        'production.list-orders.v1',
        'production.preview-order-route.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
        'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
        'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
      ],
    },
    {
      id: 'processor.order-resolution',
      experience: 'processor',
      path: 'experiences/processor/src/features/order-resolution/feature.ts',
      uses: [
        'processor.preview-production-order-backlog.v1',
        'production.change-order-resolution.v1',
        'production.commit-order-backlog.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
      ],
    },
    {
      id: 'processor.production-board',
      experience: 'processor',
      path: 'experiences/processor/src/features/production-board/feature.ts',
      uses: [
        'processor.load-production-board.v1',
        'production.advance-stage.v1',
        'production.assign-stage-machines.v1',
        'production.freeze-batch-membership.v1',
        'production.reconcile-batch-progress.v1',
        'production.unfreeze-batch-membership.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/production-board/production-board.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/production-board/production-board.test.tsx',
      ],
    },
    {
      id: 'processor.scheduling',
      experience: 'processor',
      path: 'experiences/processor/src/features/scheduling/feature.ts',
      uses: [
        'processor.load-production-workspace.v1',
        'production.accept-schedule.v1',
        'production.confirm-order-overtime.v1',
        'production.create-schedule.v1',
        'production.create-shift.v1',
        'production.load-schedule.v1',
        'production.place-order-automatically.v1',
        'production.place-order-exactly.v1',
        'production.replace-shift-selection.v1',
        'production.set-order-priority.v1',
        'production.start-schedule.v1',
        'production.subscribe-changes.v1',
        'production.update-shift.v1',
      ],
      stateProofs: [
        'experiences/processor/src/features/scheduling/scheduling.test.tsx',
        'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/scheduling/scheduling.test.tsx',
        'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
      ],
    },
    {
      id: 'processor.settings',
      experience: 'processor',
      path: 'experiences/processor/src/features/settings/feature.ts',
      uses: ['production.publish-scheduler-config.v1'],
      stateProofs: [
        'experiences/processor/src/features/settings/scheduler-config-publication.test.tsx',
      ],
      componentProofs: [
        'experiences/processor/src/features/settings/scheduler-config-publication.test.tsx',
      ],
    },
  ],
  operations: [
    {
      id: 'access.accept-workforce-invitation.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'acceptWorkforceInvitationCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'acceptWorkforceInvitation',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.repo.ts',
          'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/accepted-invitation-receipt.postgres.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.spec.ts',
          'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/accept-workforce-invitation.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'requires the existing identity and active session instead of auto-linking',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/invitations/accept-workforce-invitation/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes acceptance replay, rejects divergent reuse, and rolls back a late receipt failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.accept_workforce_invitation',
    },
    {
      id: 'access.begin-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'beginMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'beginMfaEnrollment',
      },
      paths: {
        cell: 'systems/access/src/cells/mfa/begin-mfa-enrollment/cell.ts',
        contracts: [
          'systems/access/src/cells/mfa/begin-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.repo.ts',
        ],
        state: [
          'systems/access/src/cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.usecase.spec.ts',
          'systems/access/src/cells/mfa/begin-mfa-enrollment/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/mfa/begin-mfa-enrollment/begin-mfa-enrollment.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'persists only the encrypted secret and returns enrollment material',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/mfa/begin-mfa-enrollment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'converges concurrent pending enrollment and preserves enabled credentials',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'declared-concurrency-race',
                ],
              },
              {
                name: 'leaves no credential when an unknown identity fails before persistence',
                proves: ['unexpected-failure-no-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.begin_mfa_enrollment',
    },
    {
      id: 'access.bootstrap-owner.v2',
      kind: 'command',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'bootstrapOwnerCellDeclaration',
        assemblyExportName: 'makeAccessBootstrapCliSystem',
        assemblyKey: 'bootstrapOwner',
      },
      paths: {
        cell: 'systems/access/src/cells/bootstrap/bootstrap-owner/cell.ts',
        contracts: [
          'systems/access/src/cells/bootstrap/bootstrap-owner/contract.ts',
        ],
        decisions: [
          'systems/access/src/cells/bootstrap/bootstrap-owner/bootstrap-owner.policy.ts',
        ],
        executors: [
          'systems/access/src/cells/bootstrap/bootstrap-owner/bootstrap-owner.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/bootstrap/bootstrap-owner/bootstrap-owner.repo.ts',
          'systems/access/src/cells/bootstrap/bootstrap-owner/postgres.ts',
        ],
        state: [],
        events: [],
        protocols: [
          'systems/access/src/cells/bootstrap/bootstrap-owner/cli.ts',
        ],
        tests: [
          'systems/access/src/cells/bootstrap/bootstrap-owner/bootstrap-owner.usecase.spec.ts',
          'systems/access/src/cells/bootstrap/bootstrap-owner/cli.spec.ts',
          'systems/access/src/cells/bootstrap/bootstrap-owner/postgres.int.spec.ts',
          'systems/access/src/cells/bootstrap/bootstrap-owner/postgres.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/bootstrap/bootstrap-owner/bootstrap-owner.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'validates normalizes hashes and creates the first owner',
                proves: ['contract', 'decision', 'executor-success'],
              },
              {
                name: 'rejects an invalid normalized business slug before effects',
                proves: ['decision', 'expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects an empty normalized business display name before effects',
                proves: ['decision', 'expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects an oversized owner password before credential effects',
                proves: ['decision', 'expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/bootstrap/bootstrap-owner/cli.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps redirected stdin and host environment into the declared command',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/bootstrap/bootstrap-owner/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes concurrent first-owner creation into one complete owner graph',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'same-payload-replay',
                  'declared-concurrency-race',
                ],
              },
              {
                name: 'uses a matching active business and rejects incompatible ID or slug facts without partial state',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'assembles real replay verification and rejects a divergent password without credential mutation',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
              {
                name: 'rejects incompatible existing business ID and slug facts before owner creation',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rolls back the complete owner graph after a forced late failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'access.bootstrap-owner-command.v2',
          name: ['bootstrap', 'owner'],
          arguments: [],
          options: [
            {
              name: 'password-stdin',
              short: null,
              value: 'boolean',
              required: true,
              repeatable: true,
            },
          ],
          stdin: {
            mode: 'required',
            encoding: 'utf8',
            maxBytes: 4096,
            tty: 'forbid',
          },
          prompt: 'none',
          contextRequirements: ['bootstrap-owner-environment'],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.bootstrap_owner',
    },
    {
      id: 'access.complete-mfa-challenge.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'completeMfaChallengeCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'completeMfaChallenge',
      },
      paths: {
        cell: 'systems/access/src/cells/mfa/complete-mfa-challenge/cell.ts',
        contracts: [
          'systems/access/src/cells/mfa/complete-mfa-challenge/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/mfa/complete-mfa-challenge/complete-mfa-challenge.repo.ts',
        ],
        state: [
          'systems/access/src/cells/mfa/complete-mfa-challenge/complete-mfa-challenge.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.spec.ts',
          'systems/access/src/cells/mfa/complete-mfa-challenge/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/mfa/complete-mfa-challenge/complete-mfa-challenge.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'creates an MFA session after a valid one-time code',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/mfa/complete-mfa-challenge/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'consumes one challenge once under concurrent replay and rolls back a late session conflict',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/mfa/complete-mfa-challenge/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'atomically reserves a bounded number of challenge attempts and durably consumes the exhausted challenge',
                proves: [
                  'postgres-commit',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.complete_mfa_challenge',
    },
    {
      id: 'access.confirm-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'confirmMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'confirmMfaEnrollment',
      },
      paths: {
        cell: 'systems/access/src/cells/mfa/confirm-mfa-enrollment/cell.ts',
        contracts: [
          'systems/access/src/cells/mfa/confirm-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.repo.ts',
        ],
        state: [
          'systems/access/src/cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.usecase.spec.ts',
          'systems/access/src/cells/mfa/confirm-mfa-enrollment/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/mfa/confirm-mfa-enrollment/confirm-mfa-enrollment.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'enables the credential stores only hashes and emits after commit',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/mfa/confirm-mfa-enrollment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one concurrent pending-to-enabled transition with codes and audit',
                proves: [
                  'postgres-commit',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
              {
                name: 'rolls back credential enablement for an invalid session and a late recovery-code conflict',
                proves: [
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'state-message-atomicity',
                ],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.confirm_mfa_enrollment',
    },
    {
      id: 'access.get-workforce-member.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'getWorkforceMemberCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'getWorkforceMember',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/memberships/get-workforce-member/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/memberships/get-workforce-member/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/memberships/get-workforce-member/get-workforce-member.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/memberships/get-workforce-member/get-workforce-member.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/memberships/get-workforce-member/get-workforce-member.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/memberships/get-workforce-member/get-workforce-member.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns the owner-local detail projection with the query clock',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.get_workforce_member',
    },
    {
      id: 'access.grant-workforce-access.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'grantWorkforceAccessCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'grantWorkforceAccess',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/access/grant-workforce-access/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/access/grant-workforce-access/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/access/grant-workforce-access/grant-workforce-access.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/access/grant-workforce-access/grant-workforce-access.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/access/grant-workforce-access/grant-workforce-access.usecase.spec.ts',
          'systems/access/src/cells/workforce/access/grant-workforce-access/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/access/grant-workforce-access/grant-workforce-access.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'normalizes optional bounds and fingerprints the persisted command',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/access/grant-workforce-access/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes grant replay, rejects divergent reuse, and rolls back a forced late failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.grant_workforce_access',
    },
    {
      id: 'access.issue-workforce-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'issueWorkforceInvitationCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'issueWorkforceInvitation',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.spec.ts',
          'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/issue-workforce-invitation.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'normalizes email stores only the keyed hash and returns the token once',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/invitations/issue-workforce-invitation/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes issue replay, rejects divergent reuse, and rolls back a late receipt failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.issue_workforce_invitation',
    },
    {
      id: 'access.list-active-business-locations.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listActiveBusinessLocationsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listActiveBusinessLocations',
      },
      paths: {
        cell: 'systems/access/src/cells/scopes/list-active-business-locations/cell.ts',
        contracts: [
          'systems/access/src/cells/scopes/list-active-business-locations/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/scopes/list-active-business-locations/list-active-business-locations.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/scopes/list-active-business-locations/list-active-business-locations.repo.ts',
        ],
        state: [
          'systems/access/src/cells/scopes/list-active-business-locations/list-active-business-locations.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/scopes/list-active-business-locations/list-active-business-locations.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/scopes/list-active-business-locations/list-active-business-locations.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves repository ordering and location facts',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'access.list_active_business_locations',
    },
    {
      id: 'access.list-active-production-locations.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listActiveProductionLocationsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listActiveProductionLocations',
      },
      paths: {
        cell: 'systems/access/src/cells/scopes/list-active-production-locations/cell.ts',
        contracts: [
          'systems/access/src/cells/scopes/list-active-production-locations/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/scopes/list-active-production-locations/list-active-production-locations.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/scopes/list-active-production-locations/list-active-production-locations.repo.ts',
        ],
        state: [
          'systems/access/src/cells/scopes/list-active-production-locations/list-active-production-locations.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/scopes/list-active-production-locations/list-active-production-locations.repo.spec.ts',
          'systems/access/src/cells/scopes/list-active-production-locations/list-active-production-locations.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/scopes/list-active-production-locations/list-active-production-locations.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves business and name ordering with raw facts',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'access.list_active_production_locations',
    },
    {
      id: 'access.list-effective-access-grants.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listEffectiveAccessGrantsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listEffectiveAccessGrants',
      },
      paths: {
        cell: 'systems/access/src/cells/scopes/list-effective-access-grants/cell.ts',
        contracts: [
          'systems/access/src/cells/scopes/list-effective-access-grants/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/scopes/list-effective-access-grants/list-effective-access-grants.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/scopes/list-effective-access-grants/list-effective-access-grants.repo.ts',
        ],
        state: [
          'systems/access/src/cells/scopes/list-effective-access-grants/list-effective-access-grants.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/scopes/list-effective-access-grants/list-effective-access-grants.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/scopes/list-effective-access-grants/list-effective-access-grants.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'uses the Access clock and preserves store ordering',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'access.list_effective_access_grants',
    },
    {
      id: 'access.list-identity-sessions.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listIdentitySessionsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listIdentitySessions',
      },
      paths: {
        cell: 'systems/access/src/cells/sessions/list-identity-sessions/cell.ts',
        contracts: [
          'systems/access/src/cells/sessions/list-identity-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/sessions/list-identity-sessions/list-identity-sessions.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/sessions/list-identity-sessions/list-identity-sessions.repo.ts',
        ],
        state: [
          'systems/access/src/cells/sessions/list-identity-sessions/list-identity-sessions.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/sessions/list-identity-sessions/list-identity-sessions.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/sessions/list-identity-sessions/list-identity-sessions.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves stored session dates in the result',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.list_identity_sessions',
    },
    {
      id: 'access.list-workforce-invitations.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listWorkforceInvitationsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listWorkforceInvitations',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/invitations/list-workforce-invitations/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/invitations/list-workforce-invitations/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/invitations/list-workforce-invitations/list-workforce-invitations.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/invitations/list-workforce-invitations/list-workforce-invitations.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/invitations/list-workforce-invitations/list-workforce-invitations.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/invitations/list-workforce-invitations/list-workforce-invitations.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'clamps pagination and preserves the invitation projection',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.list_workforce_invitations',
    },
    {
      id: 'access.list-workforce-member-sessions.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listWorkforceMemberSessionsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listWorkforceMemberSessions',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/security/list-workforce-member-sessions/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/security/list-workforce-member-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/security/list-workforce-member-sessions/list-workforce-member-sessions.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps member sessions without exposing credentials',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.list_workforce_member_sessions',
    },
    {
      id: 'access.list-workforce-security-events.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listWorkforceSecurityEventsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listWorkforceSecurityEvents',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/security/list-workforce-security-events/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/security/list-workforce-security-events/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/security/list-workforce-security-events/list-workforce-security-events.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/security/list-workforce-security-events/list-workforce-security-events.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/security/list-workforce-security-events/list-workforce-security-events.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/security/list-workforce-security-events/list-workforce-security-events.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns only the redacted audit projection',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.list_workforce_security_events',
    },
    {
      id: 'access.list-workforce.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'listWorkforceCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'listWorkforce',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/memberships/list-workforce/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/memberships/list-workforce/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/memberships/list-workforce/list-workforce.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/memberships/list-workforce/list-workforce.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/memberships/list-workforce/list-workforce.repo.spec.ts',
          'systems/access/src/cells/workforce/memberships/list-workforce/list-workforce.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/memberships/list-workforce/list-workforce.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'normalizes the query and returns the owner-local workforce page',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.list_workforce',
    },
    {
      id: 'access.load-session.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'loadSessionCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'loadSession',
      },
      paths: {
        cell: 'systems/access/src/cells/sessions/load-session/cell.ts',
        contracts: [
          'systems/access/src/cells/sessions/load-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/sessions/load-session/load-session.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/sessions/load-session/load-session.repo.ts',
          'systems/access/src/cells/sessions/load-session/workforce-assignments.postgres.ts',
        ],
        state: [
          'systems/access/src/cells/sessions/load-session/load-session.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/sessions/load-session/load-session.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/sessions/load-session/load-session.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'loads an active session touches it and returns the principal',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.load_session',
    },
    {
      id: 'access.login.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'loginCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'login',
      },
      paths: {
        cell: 'systems/access/src/cells/sessions/login/cell.ts',
        contracts: ['systems/access/src/cells/sessions/login/contract.ts'],
        decisions: [],
        executors: ['systems/access/src/cells/sessions/login/login.usecase.ts'],
        persistence: ['systems/access/src/cells/sessions/login/login.repo.ts'],
        state: ['systems/access/src/cells/sessions/login/login.model.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/sessions/login/login.usecase.spec.ts',
          'systems/access/src/cells/sessions/login/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/sessions/login/login.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'creates the session attempt record and audit event',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/sessions/login/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'records an expected credential denial without a session then commits login',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'state-message-atomicity',
                ],
              },
              {
                name: 'does not create login effects when credential verification throws',
                proves: ['unexpected-failure-no-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.login',
    },
    {
      id: 'access.preview-workforce-invitation.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'previewWorkforceInvitationCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'previewWorkforceInvitation',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.repo.ts',
        ],
        state: [
          'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/invitations/preview-workforce-invitation/preview-workforce-invitation.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns the safe invitation projection for an available token',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.preview_workforce_invitation',
    },
    {
      id: 'access.reconcile-production-location.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'reconcileProductionLocationCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'reconcileProductionLocation',
      },
      paths: {
        cell: 'systems/access/src/cells/scopes/reconcile-production-location/cell.ts',
        contracts: [
          'systems/access/src/cells/scopes/reconcile-production-location/contract.ts',
        ],
        decisions: [
          'systems/access/src/cells/scopes/reconcile-production-location/decide.ts',
        ],
        executors: [
          'systems/access/src/cells/scopes/reconcile-production-location/execute.ts',
        ],
        persistence: [
          'systems/access/src/cells/scopes/reconcile-production-location/postgres.ts',
        ],
        state: [
          'systems/access/src/cells/scopes/reconcile-production-location/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/scopes/reconcile-production-location/cell.spec.ts',
          'systems/access/src/cells/scopes/reconcile-production-location/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/scopes/reconcile-production-location/cell.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'creates the owner-local location through the declared transaction',
                proves: ['contract', 'decision', 'executor-success'],
              },
              {
                name: 'rejects ownership changes without a partial write',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rolls back a staged location after an unexpected transaction failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/scopes/reconcile-production-location/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits the canonical Access location without touching a peer owner',
                proves: ['postgres-commit', 'declared-concurrency-race'],
              },
              {
                name: 'keeps a dry-run free of writes',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rolls back the owner-local row after a forced late failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'access.reconcile_production_location',
    },
    {
      id: 'access.regenerate-mfa-recovery-codes.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'regenerateMfaRecoveryCodesCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'regenerateMfaRecoveryCodes',
      },
      paths: {
        cell: 'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/cell.ts',
        contracts: [
          'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.repo.ts',
        ],
        state: [
          'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/postgres.int.spec.ts',
          'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'atomically replaces the complete recovery-code set',
                proves: ['postgres-commit', 'state-message-atomicity'],
              },
              {
                name: 'rejects replacement without an enabled credential and writes nothing',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'keeps a complete code set under the declared identity race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'restores the prior code set after a late uniqueness failure',
                proves: [
                  'unexpected-failure-rollback',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/mfa/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'replaces stored hashes returns raw codes once and emits after persistence',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.regenerate_mfa_recovery_codes',
    },
    {
      id: 'access.reissue-workforce-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'reissueWorkforceInvitationCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'reissueWorkforceInvitation',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/postgres.int.spec.ts',
          'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes replacement replay, rejects stale state, and rolls back a late transition failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/invitations/reissue-workforce-invitation/reissue-workforce-invitation.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'does not disclose a replacement token when reissue is replayed',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.reissue_workforce_invitation',
    },
    {
      id: 'access.remove-mfa.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'removeMfaCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'removeMfa',
      },
      paths: {
        cell: 'systems/access/src/cells/mfa/remove-mfa/cell.ts',
        contracts: ['systems/access/src/cells/mfa/remove-mfa/contract.ts'],
        decisions: [],
        executors: [
          'systems/access/src/cells/mfa/remove-mfa/remove-mfa.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/mfa/remove-mfa/remove-mfa.repo.ts',
        ],
        state: ['systems/access/src/cells/mfa/remove-mfa/remove-mfa.model.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/mfa/remove-mfa/postgres.int.spec.ts',
          'systems/access/src/cells/mfa/remove-mfa/remove-mfa.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/mfa/remove-mfa/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'removes MFA, downgrades the current session, and revokes peers in one commit',
                proves: ['postgres-commit', 'state-message-atomicity'],
              },
              {
                name: 'rejects an unknown identity without leaving partial MFA or audit state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'converges concurrent removal on the declared identity partition',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'restores credentials and sessions after a forced late failure',
                proves: [
                  'unexpected-failure-rollback',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/mfa/remove-mfa/remove-mfa.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'removes MFA and emits the mutation only after persistence',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.remove_mfa',
    },
    {
      id: 'access.resolve-location-ancestry.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'resolveLocationAncestryCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'resolveLocationAncestry',
      },
      paths: {
        cell: 'systems/access/src/cells/scopes/resolve-location-ancestry/cell.ts',
        contracts: [
          'systems/access/src/cells/scopes/resolve-location-ancestry/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/scopes/resolve-location-ancestry/resolve-location-ancestry.usecase.ts',
        ],
        persistence: [],
        state: [
          'systems/access/src/cells/scopes/resolve-location-ancestry/resolve-location-ancestry.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/scopes/resolve-location-ancestry/resolve-location-ancestry.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/scopes/resolve-location-ancestry/resolve-location-ancestry.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'derives business identity from canonical ancestry',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'authorization.resolve_location_ancestry',
    },
    {
      id: 'access.resolve-production-visibility.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'resolveProductionVisibilityCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'resolveProductionVisibility',
      },
      paths: {
        cell: 'systems/access/src/cells/scopes/resolve-production-visibility/cell.ts',
        contracts: [
          'systems/access/src/cells/scopes/resolve-production-visibility/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/scopes/resolve-production-visibility/resolve-production-visibility.usecase.ts',
        ],
        persistence: [],
        state: [
          'systems/access/src/cells/scopes/resolve-production-visibility/resolve-production-visibility.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/scopes/resolve-production-visibility/resolve-production-visibility.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/scopes/resolve-production-visibility/resolve-production-visibility.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'unions active direct and business-derived locations deterministically',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'authorization.resolve_production_visibility',
    },
    {
      id: 'access.revoke-identity-sessions.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'revokeIdentitySessionsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'revokeIdentitySessions',
      },
      paths: {
        cell: 'systems/access/src/cells/sessions/revoke-identity-sessions/cell.ts',
        contracts: [
          'systems/access/src/cells/sessions/revoke-identity-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/sessions/revoke-identity-sessions/revoke-identity-sessions.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/sessions/revoke-identity-sessions/revoke-identity-sessions.repo.ts',
        ],
        state: [
          'systems/access/src/cells/sessions/revoke-identity-sessions/revoke-identity-sessions.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/sessions/revoke-identity-sessions/postgres.int.spec.ts',
          'systems/access/src/cells/sessions/revoke-identity-sessions/revoke-identity-sessions.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/sessions/revoke-identity-sessions/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'revokes all sessions, replays as a no-op, and rolls back when audit persistence fails',
                proves: [
                  'postgres-commit',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'state-message-atomicity',
                ],
              },
              {
                name: 'rejects an unknown principal reference without partially revoking sessions',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'serializes concurrent revocation on the declared identity partition',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/sessions/revoke-identity-sessions/revoke-identity-sessions.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revokes one selected session with the authenticated principal',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.revoke_identity_sessions',
    },
    {
      id: 'access.revoke-session.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'revokeSessionCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'revokeSession',
      },
      paths: {
        cell: 'systems/access/src/cells/sessions/revoke-session/cell.ts',
        contracts: [
          'systems/access/src/cells/sessions/revoke-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/sessions/revoke-session/revoke-session.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/sessions/revoke-session/revoke-session.repo.ts',
        ],
        state: [
          'systems/access/src/cells/sessions/revoke-session/revoke-session.model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/sessions/revoke-session/postgres.int.spec.ts',
          'systems/access/src/cells/sessions/revoke-session/revoke-session.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/sessions/revoke-session/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'revokes one bearer session once while repeated logout stays successful',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'state-message-atomicity',
                ],
              },
              {
                name: 'rejects an expired session match without changing session or audit state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'leaves PostgreSQL untouched when token hashing fails before the write',
                proves: ['unexpected-failure-no-write'],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/sessions/revoke-session/revoke-session.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revokes a session by token hash and records the logout audit event',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.revoke_session',
    },
    {
      id: 'access.revoke-workforce-access.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'revokeWorkforceAccessCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'revokeWorkforceAccess',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/access/revoke-workforce-access/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/access/revoke-workforce-access/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/access/revoke-workforce-access/revoke-workforce-access.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/access/revoke-workforce-access/postgres.int.spec.ts',
          'systems/access/src/cells/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/access/revoke-workforce-access/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes revoke replay, rejects a stale version, and rolls back session reduction after a forced late failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/access/revoke-workforce-access/revoke-workforce-access.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns the atomic session-revocation count after access reduction',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.revoke_workforce_access',
    },
    {
      id: 'access.revoke-workforce-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'revokeWorkforceInvitationCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'revokeWorkforceInvitation',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/postgres.int.spec.ts',
          'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes revocation replay, rejects stale state, and rolls back a late transition failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/invitations/revoke-workforce-invitation/revoke-workforce-invitation.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'normalizes reason and fingerprints the optimistic mutation',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.revoke_workforce_invitation',
    },
    {
      id: 'access.revoke-workforce-member-sessions.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'revokeWorkforceMemberSessionsCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'revokeWorkforceMemberSessions',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/postgres.int.spec.ts',
          'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes selected-session replay, rejects divergent reuse, and rolls back a late receipt failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/security/revoke-workforce-member-sessions/revoke-workforce-member-sessions.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'keeps session revocation replay-safe',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.revoke_workforce_member_sessions',
    },
    {
      id: 'access.transition-workforce-membership.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'access',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: 'transitionWorkforceMembershipCellDeclaration',
        assemblyExportName: 'makeAccessSystem',
        assemblyKey: 'transitionWorkforceMembership',
      },
      paths: {
        cell: 'systems/access/src/cells/workforce/memberships/transition-workforce-membership/cell.ts',
        contracts: [
          'systems/access/src/cells/workforce/memberships/transition-workforce-membership/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/access/src/cells/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.ts',
        ],
        persistence: [
          'systems/access/src/cells/workforce/memberships/transition-workforce-membership/transition-workforce-membership.repo.ts',
        ],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'systems/access/src/cells/workforce/memberships/transition-workforce-membership/postgres.int.spec.ts',
          'systems/access/src/cells/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/access/src/cells/workforce/memberships/transition-workforce-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes suspension replay, rejects stale state, and rolls back session reduction after a forced late failure',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/access/src/cells/workforce/memberships/transition-workforce-membership/transition-workforce-membership.usecase.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'sends every versioned idempotent membership graph event',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'identity.transition_workforce_membership',
    },
    {
      id: 'control.accept-existing-invitation-mfa.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'acceptExistingMfaCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'acceptExistingInvitationMfa',
      },
      paths: {
        cell: 'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/cell.ts',
        contracts: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept existing invitation mfa preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/invitations/accept-existing-invitation-mfa/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept existing invitation mfa preserves validation from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation mfa preserves authentication from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation mfa preserves permission from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation mfa preserves not_found from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation mfa preserves conflict from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/accept/existing/mfa',
          contextRequirements: ['control-mfa-cookie', 'request-metadata'],
          boundaryProfile: 'control-accept-existing-invitation-mfa-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.accept_existing_invitation_mfa',
    },
    {
      id: 'control.accept-existing-invitation-password.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'acceptExistingPasswordCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'acceptExistingInvitationPassword',
      },
      paths: {
        cell: 'experiences/control/src/cells/invitations/accept-existing-invitation-password/cell.ts',
        contracts: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-password/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-password/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-password/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/invitations/accept-existing-invitation-password/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/invitations/accept-existing-invitation-password/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept existing invitation password preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/invitations/accept-existing-invitation-password/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept existing invitation password preserves validation from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation password preserves authentication from Access login',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation password preserves permission from invitation acceptance',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation password preserves not_found from preview',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation password preserves conflict from preview',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation password preserves rate_limit from Access login',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/accept/existing/password',
          contextRequirements: ['request-metadata'],
          boundaryProfile:
            'control-accept-existing-invitation-password-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.accept_existing_invitation_password',
    },
    {
      id: 'control.accept-existing-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'acceptExistingControlInvitationCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'acceptExistingInvitation',
      },
      paths: {
        cell: 'experiences/control/src/cells/invitations/accept-existing-invitation/cell.ts',
        contracts: [
          'experiences/control/src/cells/invitations/accept-existing-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/invitations/accept-existing-invitation/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/invitations/accept-existing-invitation/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/invitations/accept-existing-invitation/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/invitations/accept-existing-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept existing invitation preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/invitations/accept-existing-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept existing invitation preserves validation from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation preserves authentication from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation preserves permission from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation preserves not_found from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept existing invitation preserves conflict from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/accept/existing',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-accept-existing-invitation-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.accept_existing_invitation',
    },
    {
      id: 'control.accept-new-invitation.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'acceptNewControlInvitationCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'acceptNewInvitation',
      },
      paths: {
        cell: 'experiences/control/src/cells/invitations/accept-new-invitation/cell.ts',
        contracts: [
          'experiences/control/src/cells/invitations/accept-new-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/invitations/accept-new-invitation/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/invitations/accept-new-invitation/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/invitations/accept-new-invitation/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/invitations/accept-new-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept new invitation preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/invitations/accept-new-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accept new invitation preserves validation from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept new invitation preserves authentication from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept new invitation preserves permission from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept new invitation preserves not_found from Access',
                proves: ['executor-success'],
              },
              {
                name: 'accept new invitation preserves conflict from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/accept/new',
          contextRequirements: [],
          boundaryProfile: 'control-accept-new-invitation-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.accept_new_invitation',
    },
    {
      id: 'control.auth-login.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlLoginCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'login',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/auth-login/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/auth-login/contract.ts',
        ],
        decisions: [],
        executors: ['experiences/control/src/cells/auth/auth-login/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/auth/auth-login/http.ts'],
        tests: ['experiences/control/src/cells/auth/auth-login/cell.test.ts'],
        features: [
          {
            id: 'control.authentication',
            experience: 'control',
            path: 'experiences/control/src/features/authentication/feature.ts',
            uses: [
              'control.auth-login.v1',
              'control.complete-mfa-challenge.v1',
              'control.load-auth-session.v1',
              'control.logout.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/authentication/use-authentication.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/authentication/authentication-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/auth-login/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'auth login preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/auth/auth-login/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'auth login returns authentication when Access rejects the credentials',
                proves: ['executor-success'],
              },
              {
                name: 'auth login returns permission when the authenticated identity has no Control access',
                proves: ['executor-success'],
              },
              {
                name: 'auth login returns rate_limit when Access throttles login',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/login',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'control-auth-login-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.login',
    },
    {
      id: 'control.begin-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlBeginMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'beginMfaEnrollment',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/begin-mfa-enrollment/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/begin-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/begin-mfa-enrollment/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/begin-mfa-enrollment/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/begin-mfa-enrollment/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/begin-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'begin mfa enrollment preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/auth/begin-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'begin mfa enrollment preserves mfa_already_enabled from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:enroll',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/mfa/enrollment',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-begin-mfa-enrollment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.begin_mfa_enrollment',
    },
    {
      id: 'control.cli-auth-api-begin-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName:
          'controlCliAuthApiBeginMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiBeginMfaEnrollment',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth api begin mfa enrollment preserves its contract, protocol, context, and successful Access execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/cli-auth-api/begin-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth api begin mfa enrollment preserves mfa_already_enabled from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:enroll',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/mfa/enrollment',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-cli-auth-api-begin-mfa-enrollment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.begin_mfa_enrollment',
    },
    {
      id: 'control.cli-auth-api-complete-mfa-challenge.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName:
          'controlCliAuthApiCompleteMfaChallengeCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiCompleteMfaChallenge',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/complete-mfa-challenge/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/complete-mfa-challenge/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/complete-mfa-challenge/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/complete-mfa-challenge/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/complete-mfa-challenge/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/complete-mfa-challenge/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'Control CLI API MFA challenge declares its bearer realm and establishes an owner session',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'Control CLI API MFA challenge preserves invalid_mfa_challenge rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API MFA challenge preserves expired_mfa_challenge rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API MFA challenge preserves invalid_mfa_code rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API MFA challenge revokes authority outside Control',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/mfa/challenge',
          contextRequirements: ['request-metadata'],
          boundaryProfile:
            'control-cli-auth-api-complete-mfa-challenge-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.complete_mfa_challenge',
    },
    {
      id: 'control.cli-auth-api-confirm-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName:
          'controlCliAuthApiConfirmMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiConfirmMfaEnrollment',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth api confirm mfa enrollment preserves its contract, protocol, context, and successful Access execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/cli-auth-api/confirm-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth api confirm mfa enrollment preserves invalid_mfa_code from Access',
                proves: ['executor-success'],
              },
              {
                name: 'cli auth api confirm mfa enrollment preserves mfa_enrollment_missing from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:enroll',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/mfa/enrollment/confirm',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile:
            'control-cli-auth-api-confirm-mfa-enrollment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.confirm_mfa_enrollment',
    },
    {
      id: 'control.cli-auth-api-load-session.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlCliAuthApiLoadSessionCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiLoadSession',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/load-session/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/load-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/load-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/load-session/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/load-session/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/load-session/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'Control CLI API session query declares the raw bearer route and reloads Control authority',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'Control CLI API session query preserves invalid bearer rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API session query preserves session_expired rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API session query re-evaluates current Control authority',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/cli/auth/session',
          contextRequirements: [],
          boundaryProfile: 'control-cli-auth-api-load-session-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.load_session',
    },
    {
      id: 'control.cli-auth-api-login.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlCliAuthApiLoginCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiLogin',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/auth-login/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/auth-login/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/auth-login/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/auth-login/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/auth-login/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/auth-login/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'Control CLI API login declares its bearer realm and establishes an owner session',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'Control CLI API login preserves credential rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API login preserves login_rate_limited rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'Control CLI API login rejects identities outside Control authority',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/login',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'control-cli-auth-api-login-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.auth_login',
    },
    {
      id: 'control.cli-auth-api-logout.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlCliAuthApiLogoutCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiLogout',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/logout/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/logout/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/logout/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/logout/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/logout/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/logout/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'Control CLI API logout declares the raw bearer route and revokes once',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/logout',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'control-cli-auth-api-logout-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.logout',
    },
    {
      id: 'control.cli-auth-api-regenerate-mfa-recovery-codes.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName:
          'controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiRegenerateMfaRecoveryCodes',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/regenerate-mfa-recovery-codes/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/regenerate-mfa-recovery-codes/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/regenerate-mfa-recovery-codes/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/regenerate-mfa-recovery-codes/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/regenerate-mfa-recovery-codes/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/regenerate-mfa-recovery-codes/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth api recovery-code regeneration preserves its contract, protocol, context, and successful Access execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/mfa/recovery-codes/regenerate',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile:
            'control-cli-auth-api-regenerate-mfa-recovery-codes-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.regenerate_mfa_recovery_codes',
    },
    {
      id: 'control.cli-auth-api-remove-mfa.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlCliAuthApiRemoveMfaCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'cliAuthApiRemoveMfa',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli-auth-api/remove-mfa/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli-auth-api/remove-mfa/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli-auth-api/remove-mfa/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli-auth-api/remove-mfa/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli-auth-api/remove-mfa/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli-auth-api/remove-mfa/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth api mfa removal preserves its contract, protocol, context, and successful Access execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/cli/auth/mfa/remove',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-cli-auth-api-remove-mfa-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli_auth_api.remove_mfa',
    },
    {
      id: 'control.cli-auth-login.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthLoginCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'login',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-login/cell.ts',
        contracts: ['experiences/control/src/cells/cli/auth-login/contract.ts'],
        decisions: [],
        executors: ['experiences/control/src/cells/cli/auth-login/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/auth-login/cli.ts'],
        tests: ['experiences/control/src/cells/cli/auth-login/cell.test.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-login/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth login preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-login-command.v1',
          name: ['auth', 'login'],
          arguments: [],
          options: [
            {
              name: 'email',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'secret-stdin',
              short: null,
              value: 'boolean',
              required: true,
              repeatable: false,
            },
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'required',
            encoding: 'utf8',
            maxBytes: 4096,
            tty: 'forbid',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_login',
    },
    {
      id: 'control.cli-auth-logout.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthLogoutCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'logout',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-logout/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/auth-logout/contract.ts',
        ],
        decisions: [],
        executors: ['experiences/control/src/cells/cli/auth-logout/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/auth-logout/cli.ts'],
        tests: ['experiences/control/src/cells/cli/auth-logout/cell.test.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-logout/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth logout preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-logout-command.v1',
          name: ['auth', 'logout'],
          arguments: [],
          options: [
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_logout',
    },
    {
      id: 'control.cli-auth-mfa-confirm.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthMfaConfirmCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'mfaConfirm',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-mfa-confirm/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/auth-mfa-confirm/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/auth-mfa-confirm/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli/auth-mfa-confirm/cli.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli/auth-mfa-confirm/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-mfa-confirm/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth mfa confirm preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-mfa-confirm-command.v1',
          name: ['auth', 'mfa-confirm'],
          arguments: [],
          options: [
            {
              name: 'secret-stdin',
              short: null,
              value: 'boolean',
              required: true,
              repeatable: false,
            },
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'required',
            encoding: 'utf8',
            maxBytes: 128,
            tty: 'forbid',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_mfa_confirm',
    },
    {
      id: 'control.cli-auth-mfa-enroll.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthMfaEnrollCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'mfaEnroll',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-mfa-enroll/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/auth-mfa-enroll/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/auth-mfa-enroll/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/auth-mfa-enroll/cli.ts'],
        tests: [
          'experiences/control/src/cells/cli/auth-mfa-enroll/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-mfa-enroll/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth mfa enroll preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-mfa-enroll-command.v1',
          name: ['auth', 'mfa-enroll'],
          arguments: [],
          options: [
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_mfa_enroll',
    },
    {
      id: 'control.cli-auth-mfa-recovery-codes.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthMfaRecoveryCodesCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'mfaRecoveryCodes',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-mfa-recovery-codes/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/auth-mfa-recovery-codes/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/auth-mfa-recovery-codes/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli/auth-mfa-recovery-codes/cli.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli/auth-mfa-recovery-codes/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-mfa-recovery-codes/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth mfa recovery codes preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-mfa-recovery-codes-command.v1',
          name: ['auth', 'mfa-recovery-codes'],
          arguments: [],
          options: [
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_mfa_recovery_codes',
    },
    {
      id: 'control.cli-auth-mfa-remove.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthMfaRemoveCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'mfaRemove',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-mfa-remove/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/auth-mfa-remove/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/auth-mfa-remove/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/auth-mfa-remove/cli.ts'],
        tests: [
          'experiences/control/src/cells/cli/auth-mfa-remove/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-mfa-remove/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth mfa remove preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-mfa-remove-command.v1',
          name: ['auth', 'mfa-remove'],
          arguments: [],
          options: [
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_mfa_remove',
    },
    {
      id: 'control.cli-auth-session.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliAuthSessionCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'session',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/auth-session/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/auth-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/auth-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/auth-session/cli.ts'],
        tests: ['experiences/control/src/cells/cli/auth-session/cell.test.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/auth-session/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli auth session preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-auth-session-command.v1',
          name: ['auth', 'session'],
          arguments: [],
          options: [
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: false,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: false,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.auth_session',
    },
    {
      id: 'control.cli-bootstrap-production.v2',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliProductionBootstrapCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'productionBootstrap',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/bootstrap-production/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/bootstrap-production/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/bootstrap-production/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/cli/bootstrap-production/cli.ts',
        ],
        tests: [
          'experiences/control/src/cells/cli/bootstrap-production/cell.test.ts',
          'experiences/control/src/cells/cli/bootstrap-production/execute.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/bootstrap-production/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli bootstrap production preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/cli/bootstrap-production/execute.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'serializes divergent manifests across every owner preview and apply',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-bootstrap-production-command.v2',
          name: ['bootstrap', 'production'],
          arguments: [
            {
              name: 'extra',
              required: false,
              variadic: true,
            },
          ],
          options: [
            {
              name: 'file',
              short: null,
              value: 'string',
              required: true,
              repeatable: true,
            },
            {
              name: 'actor-id',
              short: null,
              value: 'string',
              required: true,
              repeatable: true,
            },
            {
              name: 'idempotency-key',
              short: null,
              value: 'string',
              required: true,
              repeatable: true,
            },
            {
              name: 'dry-run',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'apply',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: null,
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0, 2],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.bootstrap_production_v2',
    },
    {
      id: 'control.cli-pricing-plan.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliPricingPlanCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'plan',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/pricing-plan/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/pricing-plan/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/pricing-plan/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/pricing-plan/cli.ts'],
        tests: ['experiences/control/src/cells/cli/pricing-plan/cell.test.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/pricing-plan/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli pricing plan preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-pricing-plan-command.v1',
          name: ['pricing', 'plan'],
          arguments: [
            {
              name: 'ignored',
              required: false,
              variadic: true,
            },
          ],
          options: [
            {
              name: 'service',
              short: null,
              value: 'string',
              required: true,
              repeatable: true,
            },
            {
              name: 'set',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'reason',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'yes',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: true,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: {
            exitCodes: [0, 1],
          },
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.pricing_plan',
    },
    {
      id: 'control.cli-pricing-publish.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliPricingPublishCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'publish',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/pricing-publish/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/pricing-publish/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/pricing-publish/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/pricing-publish/cli.ts'],
        tests: [
          'experiences/control/src/cells/cli/pricing-publish/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/pricing-publish/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli pricing publish preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-pricing-publish-command.v1',
          name: ['pricing', 'publish'],
          arguments: [
            {
              name: 'ignored',
              required: false,
              variadic: true,
            },
          ],
          options: [
            {
              name: 'service',
              short: null,
              value: 'string',
              required: true,
              repeatable: true,
            },
            {
              name: 'set',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'reason',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'yes',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: true,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: {
            exitCodes: [0, 1],
          },
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.pricing_publish',
    },
    {
      id: 'control.cli-pricing-show.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'adminCliPricingShowCellDeclaration',
        assemblyExportName: 'makeAdminCliExperience',
        assemblyKey: 'show',
      },
      paths: {
        cell: 'experiences/control/src/cells/cli/pricing-show/cell.ts',
        contracts: [
          'experiences/control/src/cells/cli/pricing-show/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/cli/pricing-show/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/cli/pricing-show/cli.ts'],
        tests: ['experiences/control/src/cells/cli/pricing-show/cell.test.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/cli/pricing-show/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'cli pricing show preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary diagnostic code under the finite CLI failure kind',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [
        {
          kind: 'cli',
          id: 'control.cli-pricing-show-command.v1',
          name: ['pricing', 'show'],
          arguments: [
            {
              name: 'ignored',
              required: false,
              variadic: true,
            },
          ],
          options: [
            {
              name: 'service',
              short: null,
              value: 'string',
              required: true,
              repeatable: true,
            },
            {
              name: 'set',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'reason',
              short: null,
              value: 'string',
              required: false,
              repeatable: true,
            },
            {
              name: 'yes',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'json',
              short: null,
              value: 'boolean',
              required: false,
              repeatable: true,
            },
            {
              name: 'help',
              short: 'h',
              value: 'boolean',
              required: false,
              repeatable: true,
            },
          ],
          stdin: {
            mode: 'none',
            encoding: 'utf8',
            maxBytes: null,
            tty: 'allow',
          },
          prompt: 'none',
          contextRequirements: [],
          capabilityRequirements: [],
          interactive: {
            exitCodes: [0, 1],
          },
          presentation: {
            success: {
              stream: 'stdout',
              exitCodes: [0],
            },
            failure: {
              stream: 'stderr',
              exitCodes: [1],
            },
            invalidInvocation: {
              stream: 'stderr',
              exitCode: 1,
            },
          },
        },
      ],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.cli.pricing_show',
    },
    {
      id: 'control.complete-mfa-challenge.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlCompleteMfaChallengeCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'completeMfaChallenge',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/complete-mfa-challenge/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/complete-mfa-challenge/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/complete-mfa-challenge/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/complete-mfa-challenge/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/complete-mfa-challenge/cell.test.ts',
        ],
        features: [
          {
            id: 'control.authentication',
            experience: 'control',
            path: 'experiences/control/src/features/authentication/feature.ts',
            uses: [
              'control.auth-login.v1',
              'control.complete-mfa-challenge.v1',
              'control.load-auth-session.v1',
              'control.logout.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/authentication/use-authentication.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/authentication/authentication-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/complete-mfa-challenge/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'complete mfa challenge preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/auth/complete-mfa-challenge/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'complete mfa challenge returns authentication when Access rejects the challenge',
                proves: ['executor-success'],
              },
              {
                name: 'complete mfa challenge returns permission when the identity has no Control access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/mfa/challenge',
          contextRequirements: ['control-mfa-cookie', 'request-metadata'],
          boundaryProfile: 'control-complete-mfa-challenge-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.complete_mfa_challenge',
    },
    {
      id: 'control.confirm-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlConfirmMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'confirmMfaEnrollment',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/confirm-mfa-enrollment/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/confirm-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/confirm-mfa-enrollment/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/confirm-mfa-enrollment/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/confirm-mfa-enrollment/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/confirm-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'confirm mfa enrollment preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/auth/confirm-mfa-enrollment/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'confirm mfa enrollment preserves invalid_mfa_code from Access',
                proves: ['executor-success'],
              },
              {
                name: 'confirm mfa enrollment preserves mfa_enrollment_missing from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:enroll',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/mfa/enrollment/confirm',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-confirm-mfa-enrollment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.confirm_mfa_enrollment',
    },
    {
      id: 'control.correct-order.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'correctControlOrderCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'correctOrder',
      },
      paths: {
        cell: 'experiences/control/src/cells/orders/correct-order/cell.ts',
        contracts: [
          'experiences/control/src/cells/orders/correct-order/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/orders/correct-order/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/orders/correct-order/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/orders/correct-order/cell.test.ts',
        ],
        features: [
          {
            id: 'control.orders',
            experience: 'control',
            path: 'experiences/control/src/features/orders/feature.ts',
            uses: [
              'control.correct-order.v1',
              'control.create-order.v1',
              'control.get-order.v1',
              'control.list-customers.v1',
              'control.list-orders.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/orders/correct-order/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'correct order preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/orders/correct-order/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.correct-order.v1 preserves order_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PATCH',
          path: '/control/orders/:orderId',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-correct-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.correct_order',
    },
    {
      id: 'control.create-customer.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'createControlCustomerCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'createCustomer',
      },
      paths: {
        cell: 'experiences/control/src/cells/customers/create-customer/cell.ts',
        contracts: [
          'experiences/control/src/cells/customers/create-customer/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/customers/create-customer/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/customers/create-customer/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/customers/create-customer/cell.test.ts',
        ],
        features: [
          {
            id: 'control.customers',
            experience: 'control',
            path: 'experiences/control/src/features/customers/feature.ts',
            uses: [
              'control.create-customer.v1',
              'control.get-customer.v1',
              'control.list-customers.v1',
              'control.update-customer.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/customers/create-customer/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'create customer preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/customers/create-customer/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.create-customer.v1 preserves customer_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'customers:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/customers',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-create-customer-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.create_customer',
    },
    {
      id: 'control.create-order.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'createControlOrderCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'createOrder',
      },
      paths: {
        cell: 'experiences/control/src/cells/orders/create-order/cell.ts',
        contracts: [
          'experiences/control/src/cells/orders/create-order/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/orders/create-order/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/orders/create-order/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/orders/create-order/cell.test.ts',
        ],
        features: [
          {
            id: 'control.orders',
            experience: 'control',
            path: 'experiences/control/src/features/orders/feature.ts',
            uses: [
              'control.correct-order.v1',
              'control.create-order.v1',
              'control.get-order.v1',
              'control.list-customers.v1',
              'control.list-orders.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/orders/create-order/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'create order preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/orders/create-order/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.create-order.v1 preserves order_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
              {
                name: 'control.create-order.v1 preserves location_not_found from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/orders',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-create-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.create_order',
    },
    {
      id: 'control.end-membership.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'endControlMembershipCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'endMembership',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/end-membership/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/end-membership/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/end-membership/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/end-membership/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/end-membership/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/end-membership/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'end membership preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/end-membership/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.end-membership.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/team/:membershipId/end',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-end-membership-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control_end-membership_v1',
    },
    {
      id: 'control.get-customer.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'getControlCustomerCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'getCustomer',
      },
      paths: {
        cell: 'experiences/control/src/cells/customers/get-customer/cell.ts',
        contracts: [
          'experiences/control/src/cells/customers/get-customer/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/customers/get-customer/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/customers/get-customer/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/customers/get-customer/cell.test.ts',
        ],
        features: [
          {
            id: 'control.customers',
            experience: 'control',
            path: 'experiences/control/src/features/customers/feature.ts',
            uses: [
              'control.create-customer.v1',
              'control.get-customer.v1',
              'control.list-customers.v1',
              'control.update-customer.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/customers/get-customer/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'get customer preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/customers/get-customer/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.get-customer.v1 preserves customer_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'customers:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/customers/:userId',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-get-customer-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.get_customer',
    },
    {
      id: 'control.get-member.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'getControlMemberCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'getMember',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/get-member/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/get-member/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/get-member/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/get-member/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/get-member/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/get-member/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'get member preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/get-member/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.get-member.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/team/:membershipId',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-get-member-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.get_member',
    },
    {
      id: 'control.get-order.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'getControlOrderCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'getOrder',
      },
      paths: {
        cell: 'experiences/control/src/cells/orders/get-order/cell.ts',
        contracts: [
          'experiences/control/src/cells/orders/get-order/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/orders/get-order/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/orders/get-order/http.ts'],
        tests: ['experiences/control/src/cells/orders/get-order/cell.test.ts'],
        features: [
          {
            id: 'control.orders',
            experience: 'control',
            path: 'experiences/control/src/features/orders/feature.ts',
            uses: [
              'control.correct-order.v1',
              'control.create-order.v1',
              'control.get-order.v1',
              'control.list-customers.v1',
              'control.list-orders.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/orders/get-order/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'get order preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/orders/get-order/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.get-order.v1 preserves order_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/orders/:orderId',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-get-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.get_order',
    },
    {
      id: 'control.grant-access.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'grantControlAccessCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'grantAccess',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/grant-access/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/grant-access/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/grant-access/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/grant-access/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/grant-access/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/grant-access/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'grant access preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/grant-access/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.grant-access.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/team/:membershipId/grants',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-grant-access-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.grant_access',
    },
    {
      id: 'control.issue-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'issueControlInvitationCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'issueInvitation',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/issue-invitation/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/issue-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/issue-invitation/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/issue-invitation/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/issue-invitation/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/issue-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'issue invitation preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/issue-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.issue-invitation.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-issue-invitation-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.issue_invitation',
    },
    {
      id: 'control.list-customers.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'listControlCustomersCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listCustomers',
      },
      paths: {
        cell: 'experiences/control/src/cells/customers/list-customers/cell.ts',
        contracts: [
          'experiences/control/src/cells/customers/list-customers/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/customers/list-customers/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/customers/list-customers/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/customers/list-customers/cell.test.ts',
        ],
        features: [
          {
            id: 'control.customers',
            experience: 'control',
            path: 'experiences/control/src/features/customers/feature.ts',
            uses: [
              'control.create-customer.v1',
              'control.get-customer.v1',
              'control.list-customers.v1',
              'control.update-customer.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
          },
          {
            id: 'control.orders',
            experience: 'control',
            path: 'experiences/control/src/features/orders/feature.ts',
            uses: [
              'control.correct-order.v1',
              'control.create-order.v1',
              'control.get-order.v1',
              'control.list-customers.v1',
              'control.list-orders.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/customers/list-customers/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list customers preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/customers/list-customers/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.list-customers.v1 preserves customer_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'customers:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/customers',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-list-customers-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.list_customers',
    },
    {
      id: 'control.list-identity-sessions.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlListIdentitySessionsCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listIdentitySessions',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/list-identity-sessions/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/list-identity-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/list-identity-sessions/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/list-identity-sessions/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/list-identity-sessions/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/list-identity-sessions/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list identity sessions preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:session:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/auth/identities/:identityId/sessions',
          contextRequirements: [],
          boundaryProfile: 'control-list-identity-sessions-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.list_identity_sessions',
    },
    {
      id: 'control.list-invitations.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'listControlInvitationsCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listInvitations',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/list-invitations/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/list-invitations/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/list-invitations/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/list-invitations/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/list-invitations/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/list-invitations/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list invitations preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/list-invitations/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.list-invitations.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/invitations',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-list-invitations-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.list_invitations',
    },
    {
      id: 'control.list-member-sessions.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'listControlMemberSessionsCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listMemberSessions',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/list-member-sessions/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/list-member-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/list-member-sessions/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/list-member-sessions/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/list-member-sessions/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/list-member-sessions/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list member sessions preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/list-member-sessions/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.list-member-sessions.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/team/:membershipId/sessions',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-list-member-sessions-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.list_member_sessions',
    },
    {
      id: 'control.list-members.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'listControlMembersCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listMembers',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/list-members/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/list-members/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/list-members/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/list-members/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/list-members/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/list-members/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list members preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/list-members/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.list-members.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/team',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-list-members-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.list_members',
    },
    {
      id: 'control.list-orders.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'listControlOrdersCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listOrders',
      },
      paths: {
        cell: 'experiences/control/src/cells/orders/list-orders/cell.ts',
        contracts: [
          'experiences/control/src/cells/orders/list-orders/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/orders/list-orders/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/orders/list-orders/http.ts'],
        tests: [
          'experiences/control/src/cells/orders/list-orders/cell.test.ts',
        ],
        features: [
          {
            id: 'control.orders',
            experience: 'control',
            path: 'experiences/control/src/features/orders/feature.ts',
            uses: [
              'control.correct-order.v1',
              'control.create-order.v1',
              'control.get-order.v1',
              'control.list-customers.v1',
              'control.list-orders.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/orders/order-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/orders/list-orders/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list orders preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/orders/list-orders/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.list-orders.v1 preserves order_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
              {
                name: 'control.list-orders.v1 preserves location_not_found from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/orders',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-list-orders-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.list_orders',
    },
    {
      id: 'control.list-security-events.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'listControlSecurityEventsCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'listSecurityEvents',
      },
      paths: {
        cell: 'experiences/control/src/cells/security/list-security-events/cell.ts',
        contracts: [
          'experiences/control/src/cells/security/list-security-events/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/security/list-security-events/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/security/list-security-events/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/security/list-security-events/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/security/list-security-events/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list security events preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/security/list-security-events/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.list-security-events.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'security:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/security/events',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-list-security-events-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.list_security_events',
    },
    {
      id: 'control.load-auth-session.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlLoadSessionCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'loadSession',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/load-auth-session/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/load-auth-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/load-auth-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/load-auth-session/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/load-auth-session/cell.test.ts',
        ],
        features: [
          {
            id: 'control.authentication',
            experience: 'control',
            path: 'experiences/control/src/features/authentication/feature.ts',
            uses: [
              'control.auth-login.v1',
              'control.complete-mfa-challenge.v1',
              'control.load-auth-session.v1',
              'control.logout.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/authentication/use-authentication.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/authentication/authentication-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/load-auth-session/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load auth session preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/auth/load-auth-session/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load auth session returns authentication when Access rejects the session',
                proves: ['executor-success'],
              },
              {
                name: 'load auth session returns permission when the identity has no Control access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/control/auth/session',
          contextRequirements: ['control-session-cookie', 'request-metadata'],
          boundaryProfile: 'control-load-auth-session-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.load_session',
    },
    {
      id: 'control.logout.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlLogoutCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'logout',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/logout/cell.ts',
        contracts: ['experiences/control/src/cells/auth/logout/contract.ts'],
        decisions: [],
        executors: ['experiences/control/src/cells/auth/logout/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/auth/logout/http.ts'],
        tests: ['experiences/control/src/cells/auth/logout/cell.test.ts'],
        features: [
          {
            id: 'control.authentication',
            experience: 'control',
            path: 'experiences/control/src/features/authentication/feature.ts',
            uses: [
              'control.auth-login.v1',
              'control.complete-mfa-challenge.v1',
              'control.load-auth-session.v1',
              'control.logout.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/authentication/use-authentication.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/authentication/authentication-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/logout/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'logout preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/auth/logout/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'logout returns authentication when Access rejects the session',
                proves: ['executor-success'],
              },
              {
                name: 'logout returns permission when the identity has no Control access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/logout',
          contextRequirements: ['control-session-cookie', 'request-metadata'],
          boundaryProfile: 'control-logout-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.logout',
    },
    {
      id: 'control.preview-invitation.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'previewControlInvitationCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'previewInvitation',
      },
      paths: {
        cell: 'experiences/control/src/cells/invitations/preview-invitation/cell.ts',
        contracts: [
          'experiences/control/src/cells/invitations/preview-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/invitations/preview-invitation/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/invitations/preview-invitation/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/invitations/preview-invitation/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/invitations/preview-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preview invitation preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/invitations/preview-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preview invitation preserves validation from Access',
                proves: ['executor-success'],
              },
              {
                name: 'preview invitation preserves not_found from Access',
                proves: ['executor-success'],
              },
              {
                name: 'preview invitation preserves conflict from Access',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/preview',
          contextRequirements: [],
          boundaryProfile: 'control-preview-invitation-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.preview_invitation',
    },
    {
      id: 'control.reactivate-membership.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'reactivateControlMembershipCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'reactivateMembership',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/reactivate-membership/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/reactivate-membership/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/reactivate-membership/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/reactivate-membership/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/reactivate-membership/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/reactivate-membership/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reactivate membership preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/reactivate-membership/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.reactivate-membership.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/team/:membershipId/reactivate',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-reactivate-membership-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control_reactivate-membership_v1',
    },
    {
      id: 'control.regenerate-mfa-recovery-codes.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlRegenerateMfaRecoveryCodesCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'regenerateMfaRecoveryCodes',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/regenerate-mfa-recovery-codes/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/regenerate-mfa-recovery-codes/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/regenerate-mfa-recovery-codes/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/regenerate-mfa-recovery-codes/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/regenerate-mfa-recovery-codes/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/regenerate-mfa-recovery-codes/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'regenerate mfa recovery codes preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/mfa/recovery-codes/regenerate',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-regenerate-mfa-recovery-codes-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.regenerate_mfa_recovery_codes',
    },
    {
      id: 'control.reissue-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'reissueControlInvitationCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'reissueInvitation',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/reissue-invitation/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/reissue-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/reissue-invitation/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/reissue-invitation/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/reissue-invitation/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/reissue-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reissue invitation preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/reissue-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.reissue-invitation.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/:invitationId/reissue',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-reissue-invitation-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.reissue_invitation',
    },
    {
      id: 'control.remove-mfa.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlRemoveMfaCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'removeMfa',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/remove-mfa/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/remove-mfa/contract.ts',
        ],
        decisions: [],
        executors: ['experiences/control/src/cells/auth/remove-mfa/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/control/src/cells/auth/remove-mfa/http.ts'],
        tests: ['experiences/control/src/cells/auth/remove-mfa/cell.test.ts'],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/remove-mfa/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'remove mfa preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/mfa/remove',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-remove-mfa-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.remove_mfa',
    },
    {
      id: 'control.resolve-access.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'resolveControlAccessCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'resolveAccess',
      },
      paths: {
        cell: 'experiences/control/src/cells/access/resolve-access/cell.ts',
        contracts: [
          'experiences/control/src/cells/access/resolve-access/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/access/resolve-access/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [],
        tests: [
          'experiences/control/src/cells/access/resolve-access/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/control/src/cells/access/resolve-access/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'resolve access preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'control.resolve_access',
    },
    {
      id: 'control.revoke-access.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'revokeControlAccessCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'revokeAccess',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/revoke-access/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/revoke-access/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/revoke-access/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/revoke-access/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/revoke-access/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/revoke-access/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revoke access preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/revoke-access/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.revoke-access.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/grants/:grantId/revoke',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-revoke-access-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.revoke_access',
    },
    {
      id: 'control.revoke-all-identity-sessions.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlRevokeAllIdentitySessionsCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'revokeAllIdentitySessions',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/revoke-all-identity-sessions/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/revoke-all-identity-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/revoke-all-identity-sessions/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/revoke-all-identity-sessions/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/revoke-all-identity-sessions/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/revoke-all-identity-sessions/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revoke all identity sessions preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:session:revoke',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/identities/:identityId/sessions/revoke-all',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-revoke-all-identity-sessions-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.revoke_all_identity_sessions',
    },
    {
      id: 'control.revoke-identity-session.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlRevokeIdentitySessionCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'revokeIdentitySession',
      },
      paths: {
        cell: 'experiences/control/src/cells/auth/revoke-identity-session/cell.ts',
        contracts: [
          'experiences/control/src/cells/auth/revoke-identity-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/auth/revoke-identity-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/auth/revoke-identity-session/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/auth/revoke-identity-session/cell.test.ts',
        ],
        features: [
          {
            id: 'control.security',
            experience: 'control',
            path: 'experiences/control/src/features/security/feature.ts',
            uses: [
              'control.begin-mfa-enrollment.v1',
              'control.confirm-mfa-enrollment.v1',
              'control.list-identity-sessions.v1',
              'control.list-security-events.v1',
              'control.regenerate-mfa-recovery-codes.v1',
              'control.remove-mfa.v1',
              'control.revoke-all-identity-sessions.v1',
              'control.revoke-identity-session.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/security/security-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/auth/revoke-identity-session/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revoke identity session preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:session:revoke',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/auth/identities/:identityId/sessions/:sessionId/revoke',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'control-revoke-identity-session-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.authentication.revoke_identity_session',
    },
    {
      id: 'control.revoke-invitation.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'revokeControlInvitationCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'revokeInvitation',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/revoke-invitation/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/revoke-invitation/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/revoke-invitation/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/revoke-invitation/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/revoke-invitation/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/revoke-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revoke invitation preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/revoke-invitation/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.revoke-invitation.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/invitations/:invitationId/revoke',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-revoke-invitation-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.revoke_invitation',
    },
    {
      id: 'control.revoke-member-sessions.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'revokeControlMemberSessionsCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'revokeMemberSessions',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/revoke-member-sessions/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/revoke-member-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/revoke-member-sessions/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/revoke-member-sessions/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/revoke-member-sessions/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/revoke-member-sessions/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'revoke member sessions preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/revoke-member-sessions/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.revoke-member-sessions.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/team/:membershipId/sessions/revoke',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-revoke-member-sessions-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.revoke_member_sessions',
    },
    {
      id: 'control.suspend-membership.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'suspendControlMembershipCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'suspendMembership',
      },
      paths: {
        cell: 'experiences/control/src/cells/workforce/suspend-membership/cell.ts',
        contracts: [
          'experiences/control/src/cells/workforce/suspend-membership/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/workforce/suspend-membership/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/workforce/suspend-membership/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/workforce/suspend-membership/cell.test.ts',
        ],
        features: [
          {
            id: 'control.team',
            experience: 'control',
            path: 'experiences/control/src/features/team/feature.ts',
            uses: [
              'control.accept-existing-invitation-mfa.v1',
              'control.accept-existing-invitation-password.v1',
              'control.accept-existing-invitation.v1',
              'control.accept-new-invitation.v1',
              'control.end-membership.v1',
              'control.get-member.v1',
              'control.grant-access.v1',
              'control.issue-invitation.v1',
              'control.list-invitations.v1',
              'control.list-member-sessions.v1',
              'control.list-members.v1',
              'control.preview-invitation.v1',
              'control.reactivate-membership.v1',
              'control.reissue-invitation.v1',
              'control.revoke-access.v1',
              'control.revoke-invitation.v1',
              'control.revoke-member-sessions.v1',
              'control.suspend-membership.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/team/team-workspace.test.tsx',
              'experiences/control/src/features/team/invitation-acceptance-view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/workforce/suspend-membership/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'suspend membership preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/workforce/suspend-membership/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.suspend-membership.v1 preserves workforce_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'team:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/control/team/:membershipId/suspend',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-suspend-membership-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control_suspend-membership_v1',
    },
    {
      id: 'control.update-customer.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'control',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'updateControlCustomerCellDeclaration',
        assemblyExportName: 'makeControlExperience',
        assemblyKey: 'updateCustomer',
      },
      paths: {
        cell: 'experiences/control/src/cells/customers/update-customer/cell.ts',
        contracts: [
          'experiences/control/src/cells/customers/update-customer/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/control/src/cells/customers/update-customer/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/control/src/cells/customers/update-customer/http.ts',
        ],
        tests: [
          'experiences/control/src/cells/customers/update-customer/cell.test.ts',
        ],
        features: [
          {
            id: 'control.customers',
            experience: 'control',
            path: 'experiences/control/src/features/customers/feature.ts',
            uses: [
              'control.create-customer.v1',
              'control.get-customer.v1',
              'control.list-customers.v1',
              'control.update-customer.v1',
            ],
            stateProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/control/src/features/customers/customer-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/control/src/cells/customers/update-customer/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'update customer preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/control/src/cells/customers/update-customer/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'control.update-customer.v1 preserves customer_rejected from its reachable executor branch',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'customers:write',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PATCH',
          path: '/control/customers/:userId',
          contextRequirements: ['control-request-context'],
          boundaryProfile: 'control-update-customer-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['control'],
      observability: 'control.update_customer',
    },
    {
      id: 'customer.auth-login.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerLoginCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'login',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/login/cell.ts',
        contracts: ['experiences/customer/src/cells/auth/login/contract.ts'],
        decisions: [],
        executors: ['experiences/customer/src/cells/auth/login/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/customer/src/cells/auth/login/http.ts'],
        tests: ['experiences/customer/src/cells/auth/login/login.spec.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/login/login.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns its strict contract, public route, and Access login mapping',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/customer/src/cells/auth/login/login.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves invalid_credentials as typed Access rejection data',
                proves: ['executor-success'],
              },
              {
                name: 'preserves login_rate_limited as typed Access rejection data',
                proves: ['executor-success'],
              },
              {
                name: 'rejects a non-Customer identity and revokes its created session',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/login',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'customer-auth-login-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.login',
    },
    {
      id: 'customer.begin-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerBeginMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'beginMfaEnrollment',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/begin-mfa-enrollment/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/begin-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/begin-mfa-enrollment/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/begin-mfa-enrollment/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/begin-mfa-enrollment/begin-mfa-enrollment.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/begin-mfa-enrollment/begin-mfa-enrollment.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'binds the authenticated identity label to the Access enrollment command',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/customer/src/cells/auth/begin-mfa-enrollment/begin-mfa-enrollment.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves mfa_already_enabled as the only reachable enrollment rejection',
                proves: ['contract', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:enroll',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/mfa/enrollment',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'customer-begin-mfa-enrollment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.begin_mfa_enrollment',
    },
    {
      id: 'customer.complete-mfa-challenge.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerCompleteMfaChallengeCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'completeMfaChallenge',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/complete-mfa-challenge/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/complete-mfa-challenge/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/complete-mfa-challenge/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/complete-mfa-challenge/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/complete-mfa-challenge/complete-mfa-challenge.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/complete-mfa-challenge/complete-mfa-challenge.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the challenge contract and projects the authenticated principal',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/customer/src/cells/auth/complete-mfa-challenge/complete-mfa-challenge.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves invalid_mfa_challenge without projecting a principal',
                proves: ['contract', 'executor-success'],
              },
              {
                name: 'preserves expired_mfa_challenge without projecting a principal',
                proves: ['executor-success'],
              },
              {
                name: 'preserves invalid_mfa_code without projecting a principal',
                proves: ['executor-success'],
              },
              {
                name: 'rejects a completed non-Customer challenge and revokes its session',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/mfa/challenge',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'customer-complete-mfa-challenge-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.complete_mfa_challenge',
    },
    {
      id: 'customer.confirm-mfa-enrollment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerConfirmMfaEnrollmentCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'confirmMfaEnrollment',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/confirm-mfa-enrollment/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/confirm-mfa-enrollment/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/confirm-mfa-enrollment/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/confirm-mfa-enrollment/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/confirm-mfa-enrollment/confirm-mfa-enrollment.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/confirm-mfa-enrollment/confirm-mfa-enrollment.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps the session-bound confirmation and copies recovery codes',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
          {
            path: 'experiences/customer/src/cells/auth/confirm-mfa-enrollment/confirm-mfa-enrollment.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves invalid_mfa_code without copying recovery material',
                proves: ['contract', 'executor-success'],
              },
              {
                name: 'preserves mfa_enrollment_missing without copying recovery material',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:enroll',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/mfa/enrollment/confirm',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'customer-confirm-mfa-enrollment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.confirm_mfa_enrollment',
    },
    {
      id: 'customer.list-identity-sessions.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerListIdentitySessionsCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'listIdentitySessions',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/list-identity-sessions/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/list-identity-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/list-identity-sessions/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/list-identity-sessions/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/list-identity-sessions/list-identity-sessions.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/list-identity-sessions/list-identity-sessions.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'keeps identity authorization before input and copies the Access inventory',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:session:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/auth/identities/:identityId/sessions',
          contextRequirements: [],
          boundaryProfile: 'customer-list-identity-sessions-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.list_identity_sessions',
    },
    {
      id: 'customer.load-auth-session.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerLoadSessionCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'loadSession',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/load-session/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/load-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/load-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/customer/src/cells/auth/load-session/http.ts'],
        tests: [
          'experiences/customer/src/cells/auth/load-session/load-session.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/load-session/load-session.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'projects explicit Customer audience and expiry from the Access session',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'rejects a valid Access session outside the Customer audience',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'experiences/customer/src/cells/auth/load-session/load-session.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves invalid_session without projecting browser session state',
                proves: ['contract', 'executor-success'],
              },
              {
                name: 'preserves session_expired without projecting browser session state',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/auth/session',
          contextRequirements: [],
          boundaryProfile: 'customer-load-auth-session-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.load_session',
    },
    {
      id: 'customer.logout.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerLogoutCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'logout',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/logout/cell.ts',
        contracts: ['experiences/customer/src/cells/auth/logout/contract.ts'],
        decisions: [],
        executors: ['experiences/customer/src/cells/auth/logout/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/customer/src/cells/auth/logout/http.ts'],
        tests: ['experiences/customer/src/cells/auth/logout/logout.spec.ts'],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/logout/logout.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps the bearer proof and request identity to Access revocation',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/logout',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'customer-logout-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.logout',
    },
    {
      id: 'customer.regenerate-mfa-recovery-codes.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerRegenerateMfaRecoveryCodesCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'regenerateMfaRecoveryCodes',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/regenerate-mfa-recovery-codes/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/regenerate-mfa-recovery-codes/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/regenerate-mfa-recovery-codes/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/regenerate-mfa-recovery-codes/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/regenerate-mfa-recovery-codes/regenerate-mfa-recovery-codes.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns MFA-management authorization and returns a copied code inventory',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/mfa/recovery-codes/regenerate',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'customer-regenerate-mfa-recovery-codes-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.regenerate_mfa_recovery_codes',
    },
    {
      id: 'customer.remove-mfa.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerRemoveMfaCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'removeMfa',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/remove-mfa/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/remove-mfa/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/remove-mfa/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/customer/src/cells/auth/remove-mfa/http.ts'],
        tests: [
          'experiences/customer/src/cells/auth/remove-mfa/remove-mfa.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/remove-mfa/remove-mfa.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves the active session identity in the Access MFA removal command',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:mfa:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/mfa/remove',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'customer-remove-mfa-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.remove_mfa',
    },
    {
      id: 'customer.revoke-all-identity-sessions.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerRevokeAllIdentitySessionsCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'revokeAllIdentitySessions',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/revoke-all-identity-sessions/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/revoke-all-identity-sessions/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/revoke-all-identity-sessions/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/revoke-all-identity-sessions/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/revoke-all-identity-sessions/revoke-all-identity-sessions.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/revoke-all-identity-sessions/revoke-all-identity-sessions.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps principal and target identities without inventing a session filter',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:session:revoke',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/identities/:identityId/sessions/revoke-all',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'customer-revoke-all-identity-sessions-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.revoke_all_identity_sessions',
    },
    {
      id: 'customer.revoke-identity-session.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'customer',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerRevokeIdentitySessionCellDeclaration',
        assemblyExportName: 'makeCustomerExperience',
        assemblyKey: 'revokeIdentitySession',
      },
      paths: {
        cell: 'experiences/customer/src/cells/auth/revoke-identity-session/cell.ts',
        contracts: [
          'experiences/customer/src/cells/auth/revoke-identity-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/customer/src/cells/auth/revoke-identity-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/customer/src/cells/auth/revoke-identity-session/http.ts',
        ],
        tests: [
          'experiences/customer/src/cells/auth/revoke-identity-session/revoke-identity-session.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/customer/src/cells/auth/revoke-identity-session/revoke-identity-session.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves the exact selected session in the Access revocation input',
                proves: ['contract', 'protocol', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'auth:session:revoke',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/auth/identities/:identityId/sessions/:sessionId/revoke',
          contextRequirements: ['authenticated-principal', 'request-metadata'],
          boundaryProfile: 'customer-revoke-identity-session-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customer.authentication.revoke_identity_session',
    },
    {
      id: 'customers.create-customer.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'customers',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/customers-system',
        manifestExportName: 'createCustomerCellDeclaration',
        assemblyExportName: 'makeCustomersSystem',
        assemblyKey: 'createCustomer',
      },
      paths: {
        cell: 'systems/customers/src/cells/profiles/create-customer/cell.ts',
        contracts: [
          'systems/customers/src/cells/profiles/create-customer/contract.ts',
        ],
        decisions: [
          'systems/customers/src/cells/profiles/create-customer/decide.ts',
        ],
        executors: [
          'systems/customers/src/cells/profiles/create-customer/execute.ts',
        ],
        persistence: [
          'systems/customers/src/cells/profiles/create-customer/postgres.ts',
        ],
        state: [
          'systems/customers/src/cells/profiles/create-customer/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/customers/src/cells/profiles/create-customer/create-customer.spec.ts',
          'systems/customers/src/cells/profiles/create-customer/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/customers/src/cells/profiles/create-customer/create-customer.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the strict command contract and write declaration',
                proves: ['contract'],
              },
              {
                name: 'decides invalid input before transaction effects',
                proves: ['decision'],
              },
              {
                name: 'executes a same-payload receipt without duplicate effects',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/customers/src/cells/profiles/create-customer/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commit_success_and_same_payload_replay',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
              {
                name: 'divergent_key_conflict_no_partial_write',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'same_key_concurrency',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'unexpected_failure_rollback',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customers.create_customer',
    },
    {
      id: 'customers.get-customer.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'customers',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/customers-system',
        manifestExportName: 'getCustomerCellDeclaration',
        assemblyExportName: 'makeCustomersSystem',
        assemblyKey: 'getCustomer',
      },
      paths: {
        cell: 'systems/customers/src/cells/profiles/get-customer/cell.ts',
        contracts: [
          'systems/customers/src/cells/profiles/get-customer/contract.ts',
        ],
        decisions: [
          'systems/customers/src/cells/profiles/get-customer/decide.ts',
        ],
        executors: [
          'systems/customers/src/cells/profiles/get-customer/execute.ts',
        ],
        persistence: [
          'systems/customers/src/cells/profiles/get-customer/postgres.ts',
        ],
        state: ['systems/customers/src/cells/profiles/get-customer/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/customers/src/cells/profiles/get-customer/get-customer.spec.ts',
          'systems/customers/src/cells/profiles/get-customer/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/customers/src/cells/profiles/get-customer/get-customer.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the strict query contract and read declaration',
                proves: ['contract'],
              },
              {
                name: 'decides malformed identity and executes scoped absence',
                proves: ['decision', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/customers/src/cells/profiles/get-customer/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'business_scoped_read',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customers.get_customer',
    },
    {
      id: 'customers.list-customers.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'customers',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/customers-system',
        manifestExportName: 'listCustomersCellDeclaration',
        assemblyExportName: 'makeCustomersSystem',
        assemblyKey: 'listCustomers',
      },
      paths: {
        cell: 'systems/customers/src/cells/profiles/list-customers/cell.ts',
        contracts: [
          'systems/customers/src/cells/profiles/list-customers/contract.ts',
        ],
        decisions: [
          'systems/customers/src/cells/profiles/list-customers/decide.ts',
        ],
        executors: [
          'systems/customers/src/cells/profiles/list-customers/execute.ts',
        ],
        persistence: [
          'systems/customers/src/cells/profiles/list-customers/postgres.ts',
        ],
        state: ['systems/customers/src/cells/profiles/list-customers/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/customers/src/cells/profiles/list-customers/list-customers.spec.ts',
          'systems/customers/src/cells/profiles/list-customers/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/customers/src/cells/profiles/list-customers/list-customers.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the strict list contract and bounded declaration',
                proves: ['contract'],
              },
              {
                name: 'decides normalized search and executes invalid cursor data',
                proves: ['decision', 'executor-success'],
              },
              {
                name: 'binds the cursor to business and normalized filters',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/customers/src/cells/profiles/list-customers/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'filtered_projection_and_cursor_binding',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customers.list_customers',
    },
    {
      id: 'customers.resolve-exact-source-customer.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'customers',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/customers-system',
        manifestExportName: 'resolveExactSourceCustomerCellDeclaration',
        assemblyExportName: 'makeCustomersSystem',
        assemblyKey: 'resolveExactSourceCustomer',
      },
      paths: {
        cell: 'systems/customers/src/cells/sources/resolve-exact-source-customer/cell.ts',
        contracts: [
          'systems/customers/src/cells/sources/resolve-exact-source-customer/contract.ts',
        ],
        decisions: [
          'systems/customers/src/cells/sources/resolve-exact-source-customer/idempotency.ts',
        ],
        executors: [
          'systems/customers/src/cells/sources/resolve-exact-source-customer/execute.ts',
        ],
        persistence: [
          'systems/customers/src/cells/sources/resolve-exact-source-customer/postgres.ts',
        ],
        state: [
          'systems/customers/src/cells/sources/resolve-exact-source-customer/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/customers/src/cells/sources/resolve-exact-source-customer/postgres.int.spec.ts',
          'systems/customers/src/cells/sources/resolve-exact-source-customer/resolve-exact-source-customer.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/customers/src/cells/sources/resolve-exact-source-customer/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commit_success_replay_and_business_conflict',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'idempotency_conflict_does_not_create_a_second_source_customer',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'same_source_concurrency',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'unexpected_failure_rollback',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/customers/src/cells/sources/resolve-exact-source-customer/resolve-exact-source-customer.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the complete source-partitioned contract',
                proves: ['contract'],
              },
              {
                name: 'decides an expected cross-business identity conflict',
                proves: ['decision'],
              },
              {
                name: 'executes one canonical source-customer resolution',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customers.resolve_exact_source_customer',
    },
    {
      id: 'customers.update-customer.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'customers',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/customers-system',
        manifestExportName: 'updateCustomerCellDeclaration',
        assemblyExportName: 'makeCustomersSystem',
        assemblyKey: 'updateCustomer',
      },
      paths: {
        cell: 'systems/customers/src/cells/profiles/update-customer/cell.ts',
        contracts: [
          'systems/customers/src/cells/profiles/update-customer/contract.ts',
        ],
        decisions: [
          'systems/customers/src/cells/profiles/update-customer/decide.ts',
        ],
        executors: [
          'systems/customers/src/cells/profiles/update-customer/execute.ts',
        ],
        persistence: [
          'systems/customers/src/cells/profiles/update-customer/postgres.ts',
        ],
        state: [
          'systems/customers/src/cells/profiles/update-customer/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/customers/src/cells/profiles/update-customer/postgres.int.spec.ts',
          'systems/customers/src/cells/profiles/update-customer/update-customer.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/customers/src/cells/profiles/update-customer/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commit_success_and_expected_rejection',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'not_found_rejection_has_no_customer_or_receipt_side_effect',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'same_payload_replay_and_divergent_key_conflict',
                proves: ['same-payload-replay', 'divergent-key-conflict'],
              },
              {
                name: 'optimistic_concurrency_race',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'unexpected_failure_rollback',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/customers/src/cells/profiles/update-customer/update-customer.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the strict optimistic command contract',
                proves: ['contract'],
              },
              {
                name: 'decides version rejection and changed-field authority',
                proves: ['decision'],
              },
              {
                name: 'executes optimistic rejection without mutation',
                proves: ['executor-success'],
              },
              {
                name: 'executes changed authority and next version',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'customers.update_customer',
    },
    {
      id: 'ingress.capture-webhook-receipt.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'captureWebhookReceiptCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'captureWebhookReceipt',
      },
      paths: {
        cell: 'systems/ingress/src/cells/quarantine/capture-webhook-receipt/cell.ts',
        contracts: [
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/postgres.ts',
        ],
        state: [
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/contract.spec.ts',
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/execute.spec.ts',
          'systems/ingress/src/cells/quarantine/capture-webhook-receipt/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/quarantine/capture-webhook-receipt/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns the exact receipt boundary and durable acknowledgement',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/capture-webhook-receipt/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'assigns bounded expiry while treating ciphertext as opaque',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/capture-webhook-receipt/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one exact quarantined receipt',
                proves: ['contract', 'executor-success', 'postgres-commit'],
              },
              {
                name: 'replays identical payload and rejects divergent metadata',
                proves: [
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'serializes a same-key receipt race',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'rolls back when receipt persistence is unavailable',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.capture_webhook_receipt',
    },
    {
      id: 'ingress.claim-events.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'claimEventsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'claimEvents',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/claim-events/cell.ts',
        contracts: ['systems/ingress/src/cells/inbox/claim-events/contract.ts'],
        decisions: [],
        executors: ['systems/ingress/src/cells/inbox/claim-events/execute.ts'],
        persistence: [
          'systems/ingress/src/cells/inbox/claim-events/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/claim-events/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/inbox/claim-events/contract.spec.ts',
          'systems/ingress/src/cells/inbox/claim-events/execute.spec.ts',
          'systems/ingress/src/cells/inbox/claim-events/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/claim-events/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns lease commands and the exact claimed payload envelope',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/claim-events/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'supplies one clock reading to the atomic claim repository',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/claim-events/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits receipt-ordered lease claims',
                proves: ['contract', 'executor-success', 'postgres-commit'],
              },
              {
                name: 'rejects an active lease without a partial claim',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'uses SKIP LOCKED for a two-worker race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rolls back the full claim batch on inconsistent stored payload',
                proves: ['unexpected-failure-rollback'],
              },
              {
                name: 'maps unavailable claim persistence without changing state',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.claim_events',
    },
    {
      id: 'ingress.complete-event.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'completeEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'completeEvent',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/complete-event/cell.ts',
        contracts: [
          'systems/ingress/src/cells/inbox/complete-event/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/inbox/complete-event/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/inbox/complete-event/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/complete-event/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/inbox/complete-event/contract.spec.ts',
          'systems/ingress/src/cells/inbox/complete-event/execute.spec.ts',
          'systems/ingress/src/cells/inbox/complete-event/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/complete-event/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns the fenced claim and completion outcome',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/complete-event/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'records the processing timestamp and preserves lease-lost as data',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/complete-event/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one fenced completion',
                proves: ['contract', 'executor-success', 'postgres-commit'],
              },
              {
                name: 'rejects stale and replayed claims without mutation',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'fences a same-claim completion race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rolls back an unavailable completion transition',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.complete_event',
    },
    {
      id: 'ingress.dead-letter-event.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'deadLetterEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'deadLetterEvent',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/dead-letter-event/cell.ts',
        contracts: [
          'systems/ingress/src/cells/inbox/dead-letter-event/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/inbox/dead-letter-event/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/inbox/dead-letter-event/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/dead-letter-event/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/inbox/dead-letter-event/contract.spec.ts',
          'systems/ingress/src/cells/inbox/dead-letter-event/execute.spec.ts',
          'systems/ingress/src/cells/inbox/dead-letter-event/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/dead-letter-event/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns the fenced terminal diagnostic boundary',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/dead-letter-event/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves the exact fenced claim and terminal diagnostic',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/dead-letter-event/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one fenced terminal diagnostic',
                proves: ['contract', 'executor-success', 'postgres-commit'],
              },
              {
                name: 'rejects stale and replayed terminal fences without mutation',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'fences a divergent terminal race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rolls back an unavailable dead-letter transition',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.dead_letter_event',
    },
    {
      id: 'ingress.ingest-event.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'ingestEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'ingestEvent',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/ingest-event/cell.ts',
        contracts: ['systems/ingress/src/cells/inbox/ingest-event/contract.ts'],
        decisions: [],
        executors: ['systems/ingress/src/cells/inbox/ingest-event/execute.ts'],
        persistence: [
          'systems/ingress/src/cells/inbox/ingest-event/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/ingest-event/types.ts'],
        events: ['systems/ingress/src/cells/inbox/ingest-event/message.ts'],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/inbox/ingest-event/cell.spec.ts',
          'systems/ingress/src/cells/inbox/ingest-event/contract.spec.ts',
          'systems/ingress/src/cells/inbox/ingest-event/execute.spec.ts',
          'systems/ingress/src/cells/inbox/ingest-event/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/ingest-event/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns the normalized inbox command and durable receipt result',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/ingest-event/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'hashes canonical normalized payload before durable acknowledgement',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/ingest-event/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits the durable inbox source for one ready message',
                proves: [
                  'contract',
                  'executor-success',
                  'postgres-commit',
                  'message-compatibility',
                  'state-message-atomicity',
                ],
              },
              {
                name: 'commits an approved no-op as non-claimable state',
                proves: ['postgres-commit'],
              },
              {
                name: 'replays exact bytes and rejects a divergent deduplication key',
                proves: [
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'serializes a same-key inbox race',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'rolls back when inbox persistence is unavailable',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: ['ingress.webhook-event-ready.v1'],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.ingest_event',
    },
    {
      id: 'ingress.link-webhook-receipt.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'linkWebhookReceiptCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'linkWebhookReceipt',
      },
      paths: {
        cell: 'systems/ingress/src/cells/quarantine/link-webhook-receipt/cell.ts',
        contracts: [
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/contract.ts',
        ],
        decisions: [
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/decide.ts',
        ],
        executors: [
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/postgres.ts',
        ],
        state: [
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/contract.spec.ts',
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/decide.spec.ts',
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/execute.spec.ts',
          'systems/ingress/src/cells/quarantine/link-webhook-receipt/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/quarantine/link-webhook-receipt/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns exact receipt-event linking and expected conflict data',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/link-webhook-receipt/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'distinguishes missing receipt identity from divergent linking',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/link-webhook-receipt/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps every repository link outcome',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/link-webhook-receipt/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits and replays one exact receipt link',
                proves: [
                  'contract',
                  'executor-success',
                  'postgres-commit',
                  'same-payload-replay',
                ],
              },
              {
                name: 'returns typed missing and divergent link decisions without mutation',
                proves: [
                  'decision',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'serializes a divergent receipt-link race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rolls back an unavailable receipt link',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.link_webhook_receipt',
    },
    {
      id: 'ingress.list-dead-events.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'listDeadEventsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'listDeadEvents',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/list-dead-events/cell.ts',
        contracts: [
          'systems/ingress/src/cells/inbox/list-dead-events/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/inbox/list-dead-events/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/inbox/list-dead-events/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/list-dead-events/types.ts'],
        events: [],
        protocols: ['systems/ingress/src/cells/inbox/list-dead-events/http.ts'],
        tests: [
          'systems/ingress/src/cells/inbox/list-dead-events/contract.spec.ts',
          'systems/ingress/src/cells/inbox/list-dead-events/execute.spec.ts',
          'systems/ingress/src/cells/inbox/list-dead-events/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/list-dead-events/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns private-safe dead metadata and UTC cursor output',
                proves: ['contract'],
              },
              {
                name: 'maps the HTTP query and serializes UTC response data',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/list-dead-events/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'overfetches cursor without payload or private error text',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/list-dead-events/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'reads bounded private-safe protocol metadata',
                proves: ['contract', 'executor-success', 'protocol'],
              },
              {
                name: 'maps an unavailable dead-event read without state change',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:resources',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/webhook-ingestion/dead-letters',
          contextRequirements: [],
          boundaryProfile: 'api-ingress-dead-event-read-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.list_dead_events',
    },
    {
      id: 'ingress.measure-webhook-backlog.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'measureWebhookBacklogCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'measureWebhookBacklog',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/measure-webhook-backlog/cell.ts',
        contracts: [
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/postgres.ts',
        ],
        state: [
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/contract.spec.ts',
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/execute.spec.ts',
          'systems/ingress/src/cells/inbox/measure-webhook-backlog/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/measure-webhook-backlog/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns an empty query and bounded backlog measurement',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/measure-webhook-backlog/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'measures through the current clock boundary',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/measure-webhook-backlog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'reads pending plus processing backlog by oldest receipt',
                proves: ['contract', 'executor-success'],
              },
              {
                name: 'maps an unavailable backlog read without state change',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.measure_webhook_backlog',
    },
    {
      id: 'ingress.process-inbound-event.v1',
      kind: 'reaction',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'processInboundEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'processInboundEvent',
      },
      paths: {
        cell: 'systems/ingress/src/cells/processing/process-inbound-event/cell.ts',
        contracts: [
          'systems/ingress/src/cells/processing/process-inbound-event/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/processing/process-inbound-event/execute.ts',
        ],
        persistence: [],
        state: [
          'systems/ingress/src/cells/processing/process-inbound-event/types.ts',
        ],
        events: [
          'systems/ingress/src/cells/processing/process-inbound-event/message.ts',
        ],
        protocols: [
          'systems/ingress/src/cells/processing/process-inbound-event/job.ts',
        ],
        tests: [
          'systems/ingress/src/cells/processing/process-inbound-event/cell.spec.ts',
          'systems/ingress/src/cells/processing/process-inbound-event/cents.spec.ts',
          'systems/ingress/src/cells/processing/process-inbound-event/contract.spec.ts',
          'systems/ingress/src/cells/processing/process-inbound-event/execute.spec.ts',
          'systems/ingress/src/cells/processing/process-inbound-event/operation.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/processing/process-inbound-event/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns one versioned ready-event job boundary',
                proves: ['contract', 'protocol', 'message-compatibility'],
              },
              {
                name: 'decides and executes an approved no-op without owner effects',
                proves: ['decision', 'executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [
        {
          id: 'ingress.process-inbound-event-job.v1',
          trigger: 'message',
        },
      ],
      eventStreams: [],
      emits: [],
      consumes: ['ingress.webhook-event-ready.v1'],
      experienceConsumers: [],
      observability: 'ingress.process_inbound_event',
    },
    {
      id: 'ingress.purge-expired-webhook-receipts.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'purgeExpiredWebhookReceiptsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'purgeExpiredWebhookReceipts',
      },
      paths: {
        cell: 'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/cell.ts',
        contracts: [
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/postgres.ts',
        ],
        state: [
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/contract.spec.ts',
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/execute.spec.ts',
          'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns an empty command and exact purge count',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'purges only through the current retention boundary',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/quarantine/purge-expired-webhook-receipts/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits the exact expiry boundary and retains future receipts',
                proves: [
                  'contract',
                  'executor-success',
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'same-payload-replay',
                ],
              },
              {
                name: 'makes concurrent purge attempts delete each row once',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'rolls back an unavailable purge',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.purge_expired_webhook_receipts',
    },
    {
      id: 'ingress.receive-cents-webhook.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'receiveCentsWebhookCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'receiveCentsWebhook',
      },
      paths: {
        cell: 'systems/ingress/src/cells/sources/receive-cents-webhook/cell.ts',
        contracts: [
          'systems/ingress/src/cells/sources/receive-cents-webhook/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/sources/receive-cents-webhook/execute.ts',
        ],
        persistence: [],
        state: [
          'systems/ingress/src/cells/sources/receive-cents-webhook/types.ts',
        ],
        events: [],
        protocols: [
          'systems/ingress/src/cells/sources/receive-cents-webhook/http.ts',
        ],
        tests: [
          'systems/ingress/src/cells/sources/receive-cents-webhook/contract.spec.ts',
          'systems/ingress/src/cells/sources/receive-cents-webhook/execute.spec.ts',
          'systems/ingress/src/cells/sources/receive-cents-webhook/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/sources/receive-cents-webhook/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns exact raw bytes and the durable inbox acknowledgement',
                proves: ['contract'],
              },
              {
                name: 'maps raw HTTP bytes and the durable accepted response',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/sources/receive-cents-webhook/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'rejects cents_webhook_body_too_large before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'rejects invalid_cents_webhook_envelope before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'rejects conflicting_cents_event_kind before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'rejects invalid_cents_order_payload before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'rejects invalid_cents_customer_payload before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'rejects invalid_cents_money before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'rejects conflicting_cents_unit_price before ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'returns webhook_quarantine_receipt_not_found after durable ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'returns webhook_quarantine_link_conflict after durable ingestion',
                proves: ['executor-success'],
              },
              {
                name: 'normalizes and ingests one valid order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/sources/receive-cents-webhook/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits protocol input through capture ingest and link',
                proves: [
                  'contract',
                  'executor-success',
                  'protocol',
                  'postgres-commit',
                ],
              },
              {
                name: 'rejects malformed input without a partial business inbox write',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'heals exact replay to one receipt event and link',
                proves: ['same-payload-replay'],
              },
              {
                name: 'preserves the explicit capture crash window for redelivery healing',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
              {
                name: 'serializes concurrent exact deliveries through owner keys',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/webhooks/cents',
          contextRequirements: [],
          boundaryProfile: 'api-cents-webhook-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.receive_cents_webhook',
    },
    {
      id: 'ingress.reconcile-source-location-bindings.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'reconcileSourceLocationBindingsCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'reconcileSourceLocationBindings',
      },
      paths: {
        cell: 'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/cell.ts',
        contracts: [
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/contract.ts',
        ],
        decisions: [
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/decide.ts',
        ],
        executors: [
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/postgres.ts',
        ],
        state: [
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/model.ts',
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/contract.spec.ts',
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/decide.spec.ts',
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/execute.spec.ts',
          'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns the immutable manifest and declarative reconciliation result',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'plans immutable additions and exact no-ops',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'does not write an empty converged manifest',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/bindings/reconcile-source-location-bindings/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits additions while dry-run and exact replay stay write-free',
                proves: [
                  'contract',
                  'executor-success',
                  'postgres-commit',
                  'same-payload-replay',
                ],
              },
              {
                name: 'decides reassignment and removal rejections before writes',
                proves: [
                  'decision',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'rolls back all additions when an owner-local binding key conflicts',
                proves: ['unexpected-failure-rollback'],
              },
              {
                name: 'serializes a divergent binding race without reassignment',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'rolls back unavailable reconciliation persistence',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.reconcile_source_location_bindings',
    },
    {
      id: 'ingress.replay-dead-event.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'replayDeadEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'replayDeadEvent',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/replay-dead-event/cell.ts',
        contracts: [
          'systems/ingress/src/cells/inbox/replay-dead-event/contract.ts',
        ],
        decisions: [
          'systems/ingress/src/cells/inbox/replay-dead-event/decide.ts',
        ],
        executors: [
          'systems/ingress/src/cells/inbox/replay-dead-event/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/inbox/replay-dead-event/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/replay-dead-event/types.ts'],
        events: [],
        protocols: [
          'systems/ingress/src/cells/inbox/replay-dead-event/http.ts',
        ],
        tests: [
          'systems/ingress/src/cells/inbox/replay-dead-event/contract.spec.ts',
          'systems/ingress/src/cells/inbox/replay-dead-event/decide.spec.ts',
          'systems/ingress/src/cells/inbox/replay-dead-event/execute.spec.ts',
          'systems/ingress/src/cells/inbox/replay-dead-event/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/replay-dead-event/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns replay identity outcome and expected rejection data',
                proves: ['contract'],
              },
              {
                name: 'maps route scope and success through the HTTP surface',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/replay-dead-event/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'distinguishes missing event identity from terminal-state conflict',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/replay-dead-event/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'maps every repository replay outcome',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/replay-dead-event/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits a protocol-declared replay and resets delivery controls',
                proves: [
                  'contract',
                  'executor-success',
                  'protocol',
                  'postgres-commit',
                ],
              },
              {
                name: 'decides exact replay and typed terminal or missing rejection',
                proves: [
                  'decision',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'serializes a same-event replay race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rolls back an unavailable replay transition',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:resources',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/webhook-ingestion/dead-letters/:eventId/replay',
          contextRequirements: [],
          boundaryProfile: 'api-ingress-dead-event-replay-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.replay_dead_event',
    },
    {
      id: 'ingress.resolve-source-location.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'resolveSourceLocationCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'resolveSourceLocation',
      },
      paths: {
        cell: 'systems/ingress/src/cells/bindings/resolve-source-location/cell.ts',
        contracts: [
          'systems/ingress/src/cells/bindings/resolve-source-location/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/ingress/src/cells/bindings/resolve-source-location/execute.ts',
        ],
        persistence: [
          'systems/ingress/src/cells/bindings/resolve-source-location/postgres.ts',
        ],
        state: [
          'systems/ingress/src/cells/bindings/resolve-source-location/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/bindings/resolve-source-location/contract.spec.ts',
          'systems/ingress/src/cells/bindings/resolve-source-location/execute.spec.ts',
          'systems/ingress/src/cells/bindings/resolve-source-location/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/bindings/resolve-source-location/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns one source-scoped external identity lookup',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/bindings/resolve-source-location/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'delegates one exact source-scoped external identifier',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/bindings/resolve-source-location/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'reads only the exact active source identity',
                proves: ['contract', 'executor-success'],
              },
              {
                name: 'maps an unavailable binding read without state change',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.resolve_source_location',
    },
    {
      id: 'ingress.retry-event.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'ingress',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/ingress-system',
        manifestExportName: 'retryEventCellDeclaration',
        assemblyExportName: 'makeIngressSystem',
        assemblyKey: 'retryEvent',
      },
      paths: {
        cell: 'systems/ingress/src/cells/inbox/retry-event/cell.ts',
        contracts: ['systems/ingress/src/cells/inbox/retry-event/contract.ts'],
        decisions: [],
        executors: ['systems/ingress/src/cells/inbox/retry-event/execute.ts'],
        persistence: [
          'systems/ingress/src/cells/inbox/retry-event/postgres.ts',
        ],
        state: ['systems/ingress/src/cells/inbox/retry-event/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/ingress/src/cells/inbox/retry-event/contract.spec.ts',
          'systems/ingress/src/cells/inbox/retry-event/execute.spec.ts',
          'systems/ingress/src/cells/inbox/retry-event/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/ingress/src/cells/inbox/retry-event/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'owns the fenced retry schedule and completion result',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/retry-event/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves the exact retry schedule and diagnostic metadata',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/ingress/src/cells/inbox/retry-event/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one fenced retry schedule',
                proves: ['contract', 'executor-success', 'postgres-commit'],
              },
              {
                name: 'rejects stale and replayed retry fences without mutation',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'fences a divergent retry race',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rolls back an unavailable retry transition',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'ingress.retry_event',
    },
    {
      id: 'orders.accept-incoming-order-proposal.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'acceptIncomingOrderProposalCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'acceptIncomingOrderProposal',
      },
      paths: {
        cell: 'systems/orders/src/cells/intake/accept-incoming-order-proposal/cell.ts',
        contracts: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/types.ts',
        ],
        events: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/events.ts',
        ],
        protocols: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/contract.spec.ts',
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/execute.spec.ts',
          'systems/orders/src/cells/intake/accept-incoming-order-proposal/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/orders/src/cells/intake/accept-incoming-order-proposal/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict optimistic acceptance and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/accept-incoming-order-proposal/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'forwards the exact acceptance command and preserves canonical identity',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact proposal-acceptance HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/accept-incoming-order-proposal/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes acceptance replay, rejects divergent and decided commands, and rolls back proposal, canonical Order, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/accept-incoming-order-proposal/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects incoming_order_proposal_accept_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects incoming_order_proposal_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects incoming_order_proposal_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects incoming_order_proposal_identity_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects canonical_source_user_business_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects user_idempotency_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/incoming-orders/:proposalId/accept',
          contextRequirements: ['order-management-principal'],
          boundaryProfile: 'orders-accept-incoming-order-proposal-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'orders.accept_incoming_order_proposal',
    },
    {
      id: 'orders.cancel-order.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'cancelOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'cancelOrder',
      },
      paths: {
        cell: 'systems/orders/src/cells/lifecycle/cancel-order/cell.ts',
        contracts: [
          'systems/orders/src/cells/lifecycle/cancel-order/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/lifecycle/cancel-order/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/lifecycle/cancel-order/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/lifecycle/cancel-order/postgres.ts',
        ],
        state: ['systems/orders/src/cells/lifecycle/cancel-order/types.ts'],
        events: ['systems/orders/src/cells/lifecycle/cancel-order/events.ts'],
        protocols: ['systems/orders/src/cells/lifecycle/cancel-order/http.ts'],
        tests: [
          'systems/orders/src/cells/lifecycle/cancel-order/contract.spec.ts',
          'systems/orders/src/cells/lifecycle/cancel-order/execute.spec.ts',
          'systems/orders/src/cells/lifecycle/cancel-order/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/lifecycle/cancel-order/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict cancellation command and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/cancel-order/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts cancellation evidence and rejects an invalid expected version purely',
                proves: ['decision'],
              },
              {
                name: 'executes cancellation only after validation and preserves the writer result',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact cancellation HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/cancel-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes cancellation replay, rejects divergent and terminal commands, and rolls back state, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/cancel-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects order_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects order_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/orders/:orderId/cancel',
          contextRequirements: [
            'order-management-business-id',
            'order-management-principal',
          ],
          boundaryProfile: 'orders-cancel-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.cancel_order',
    },
    {
      id: 'orders.claim-order-outbox.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'claimOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'claimOrderOutbox',
      },
      paths: {
        cell: 'systems/orders/src/cells/outbox/claim-order-outbox/cell.ts',
        contracts: [
          'systems/orders/src/cells/outbox/claim-order-outbox/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/outbox/claim-order-outbox/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/outbox/claim-order-outbox/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/outbox/claim-order-outbox/postgres.ts',
          'systems/orders/src/cells/outbox/claim-order-outbox/stored-event.postgres.ts',
        ],
        state: ['systems/orders/src/cells/outbox/claim-order-outbox/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/outbox/claim-order-outbox/contract.spec.ts',
          'systems/orders/src/cells/outbox/claim-order-outbox/decide.spec.ts',
          'systems/orders/src/cells/outbox/claim-order-outbox/execute.spec.ts',
          'systems/orders/src/cells/outbox/claim-order-outbox/operation.spec.ts',
          'systems/orders/src/cells/outbox/claim-order-outbox/postgres.int.spec.ts',
          'systems/orders/src/cells/outbox/claim-order-outbox/stored-event.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/outbox/claim-order-outbox/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the bounded lease request and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/claim-order-outbox/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts a bounded lease request and rejects an empty worker purely',
                proves: ['decision'],
              },
              {
                name: 'reads the clock once and sends the exact lease request to persistence',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/claim-order-outbox/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'claims only ready pending and expired-processing rows in a bounded batch',
                proves: ['postgres-commit'],
              },
              {
                name: 'lets two workers claim disjoint batches under SKIP LOCKED',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'rejects an invalid claim before acquiring or mutating any lease',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'retains malformed durable JSON as an explicitly invalid claimed delivery',
                proves: ['protocol', 'message-compatibility'],
              },
              {
                name: 'rolls back every acquired lease when durable row mapping throws',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.claim_order_outbox',
    },
    {
      id: 'orders.close-incoming-order-source.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'closeIncomingOrderSourceCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'closeIncomingOrderSource',
      },
      paths: {
        cell: 'systems/orders/src/cells/intake/close-incoming-order-source/cell.ts',
        contracts: [
          'systems/orders/src/cells/intake/close-incoming-order-source/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/intake/close-incoming-order-source/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/intake/close-incoming-order-source/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/intake/close-incoming-order-source/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/intake/close-incoming-order-source/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/intake/close-incoming-order-source/cell.spec.ts',
          'systems/orders/src/cells/intake/close-incoming-order-source/contract.spec.ts',
          'systems/orders/src/cells/intake/close-incoming-order-source/execute.spec.ts',
          'systems/orders/src/cells/intake/close-incoming-order-source/operation.spec.ts',
          'systems/orders/src/cells/intake/close-incoming-order-source/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/intake/close-incoming-order-source/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves strict source-terminal evidence and typed conflict data on the wire',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/close-incoming-order-source/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts exact terminal evidence and rejects an empty source purely',
                proves: ['decision'],
              },
              {
                name: 'locks the source and stores terminal evidence before returning the tombstone',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/close-incoming-order-source/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits terminal evidence, proposal state and the exact transition atomically',
                proves: ['postgres-commit'],
              },
              {
                name: 'replays identical terminal evidence without a second transition',
                proves: ['same-payload-replay'],
              },
              {
                name: 'rejects divergent terminal evidence that reuses the same source revision key',
                proves: ['divergent-key-conflict'],
              },
              {
                name: 'serializes concurrent terminal observations for one source identity',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'commits and replays a tombstone when terminal evidence arrives before a proposal',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
              {
                name: 'keeps an existing canonical Order authoritative without a proposal transition',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rolls back tombstone and proposal state when transition persistence fails',
                proves: ['unexpected-failure-rollback'],
              },
              {
                name: 'fails before writing terminal evidence when the stored proposal snapshot is corrupt',
                proves: ['unexpected-failure-no-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.close_incoming_order_source',
    },
    {
      id: 'orders.complete-order-outbox.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'completeOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'completeOrderOutbox',
      },
      paths: {
        cell: 'systems/orders/src/cells/outbox/complete-order-outbox/cell.ts',
        contracts: [
          'systems/orders/src/cells/outbox/complete-order-outbox/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/outbox/complete-order-outbox/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/outbox/complete-order-outbox/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/outbox/complete-order-outbox/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/outbox/complete-order-outbox/contract.spec.ts',
          'systems/orders/src/cells/outbox/complete-order-outbox/execute.spec.ts',
          'systems/orders/src/cells/outbox/complete-order-outbox/operation.spec.ts',
          'systems/orders/src/cells/outbox/complete-order-outbox/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/outbox/complete-order-outbox/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the lease-owner completion fence and boolean result',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/complete-order-outbox/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'passes the exact lease owner and completion time to persistence',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/complete-order-outbox/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'completes only the current lease owner and clears prior errors',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'keeps terminal completion replay-safe for the same worker identity',
                proves: ['same-payload-replay'],
              },
              {
                name: 'rolls back completion when PostgreSQL rejects the state update',
                proves: ['unexpected-failure-rollback'],
              },
              {
                name: 'serializes concurrent completion attempts through the lease-owner fence',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.complete_order_outbox',
    },
    {
      id: 'orders.complete-order.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'completeOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'completeOrder',
      },
      paths: {
        cell: 'systems/orders/src/cells/lifecycle/complete-order/cell.ts',
        contracts: [
          'systems/orders/src/cells/lifecycle/complete-order/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/lifecycle/complete-order/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/lifecycle/complete-order/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/lifecycle/complete-order/postgres.ts',
        ],
        state: ['systems/orders/src/cells/lifecycle/complete-order/types.ts'],
        events: ['systems/orders/src/cells/lifecycle/complete-order/events.ts'],
        protocols: [
          'systems/orders/src/cells/lifecycle/complete-order/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/lifecycle/complete-order/contract.spec.ts',
          'systems/orders/src/cells/lifecycle/complete-order/execute.spec.ts',
          'systems/orders/src/cells/lifecycle/complete-order/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/lifecycle/complete-order/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict completion command and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/complete-order/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts complete evidence and rejects an invalid expected version purely',
                proves: ['decision'],
              },
              {
                name: 'executes completion only after validation and preserves the writer result',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact completion HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/complete-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes completion replay, rejects divergent and terminal commands, and rolls back state, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/complete-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects order_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects order_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/orders/:orderId/complete',
          contextRequirements: [
            'order-management-business-id',
            'order-management-principal',
          ],
          boundaryProfile: 'orders-complete-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.complete_order',
    },
    {
      id: 'orders.correct-order.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'correctOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'correctOrder',
      },
      paths: {
        cell: 'systems/orders/src/cells/lifecycle/correct-order/cell.ts',
        contracts: [
          'systems/orders/src/cells/lifecycle/correct-order/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/lifecycle/correct-order/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/lifecycle/correct-order/postgres.ts',
        ],
        state: ['systems/orders/src/cells/lifecycle/correct-order/types.ts'],
        events: ['systems/orders/src/cells/lifecycle/correct-order/events.ts'],
        protocols: ['systems/orders/src/cells/lifecycle/correct-order/http.ts'],
        tests: [
          'systems/orders/src/cells/lifecycle/correct-order/contract.spec.ts',
          'systems/orders/src/cells/lifecycle/correct-order/execute.spec.ts',
          'systems/orders/src/cells/lifecycle/correct-order/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/lifecycle/correct-order/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict optimistic correction and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/correct-order/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'forwards the exact correction to its injected writer and preserves the result',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact correction HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/correct-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes correction replay, rejects divergent and stale commands, and rolls back Order, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/correct-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects order_correction_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects order_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects order_customer_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects order_location_move_requires_command without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects fulfillment_commitment_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PATCH',
          path: '/order-management/locations/:locationId/orders/:orderId',
          contextRequirements: [
            'order-management-business-id',
            'order-management-principal',
          ],
          boundaryProfile: 'orders-correct-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.correct_order',
    },
    {
      id: 'orders.create-order.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'createOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'createOrder',
      },
      paths: {
        cell: 'systems/orders/src/cells/lifecycle/create-order/cell.ts',
        contracts: [
          'systems/orders/src/cells/lifecycle/create-order/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/lifecycle/create-order/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/lifecycle/create-order/postgres.ts',
        ],
        state: ['systems/orders/src/cells/lifecycle/create-order/types.ts'],
        events: ['systems/orders/src/cells/lifecycle/create-order/events.ts'],
        protocols: ['systems/orders/src/cells/lifecycle/create-order/http.ts'],
        tests: [
          'systems/orders/src/cells/lifecycle/create-order/contract.spec.ts',
          'systems/orders/src/cells/lifecycle/create-order/execute.spec.ts',
          'systems/orders/src/cells/lifecycle/create-order/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/lifecycle/create-order/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict direct Order command and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/create-order/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'forwards the exact direct Order command to its injected writer',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact create-Order HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/create-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes creation replay, rejects divergent reuse, and rolls back Order, fulfillment, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/lifecycle/create-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects order_create_invalid before persistence without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/orders',
          contextRequirements: [
            'order-management-business-id',
            'order-management-principal',
          ],
          boundaryProfile: 'orders-create-order-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.create_order',
    },
    {
      id: 'orders.dead-letter-order-outbox.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'deadLetterOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'deadLetterOrderOutbox',
      },
      paths: {
        cell: 'systems/orders/src/cells/outbox/dead-letter-order-outbox/cell.ts',
        contracts: [
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/contract.spec.ts',
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/decide.spec.ts',
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/execute.spec.ts',
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/operation.spec.ts',
          'systems/orders/src/cells/outbox/dead-letter-order-outbox/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/outbox/dead-letter-order-outbox/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips terminal delivery evidence and its validation failure',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/dead-letter-order-outbox/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts complete terminal evidence and rejects an empty error code purely',
                proves: ['decision'],
              },
              {
                name: 'passes exact terminal evidence and time to the lease-fenced writer',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/dead-letter-order-outbox/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'dead-letters only the current owner and retains terminal error evidence',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'rolls back dead-lettering when PostgreSQL rejects the state update',
                proves: ['unexpected-failure-rollback'],
              },
              {
                name: 'serializes concurrent dead-letter attempts through the lease-owner fence',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.dead_letter_order_outbox',
    },
    {
      id: 'orders.get-canonical-order.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'getCanonicalOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'getCanonicalOrder',
      },
      paths: {
        cell: 'systems/orders/src/cells/queries/get-canonical-order/cell.ts',
        contracts: [
          'systems/orders/src/cells/queries/get-canonical-order/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/queries/get-canonical-order/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/queries/get-canonical-order/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/queries/get-canonical-order/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/queries/get-canonical-order/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/queries/get-canonical-order/contract.spec.ts',
          'systems/orders/src/cells/queries/get-canonical-order/execute.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/queries/get-canonical-order/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one business-scoped detail query and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/queries/get-canonical-order/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts a fully scoped detail query and rejects an empty Order identity purely',
                proves: ['decision'],
              },
              {
                name: 'loads the exact scoped Order detail through its injected repository',
                proves: ['executor-success'],
              },
              {
                name: 'returns the exact order_not_found failure for an absent scoped Order',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.get_canonical_order',
    },
    {
      id: 'orders.list-canonical-orders.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'listCanonicalOrdersCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'listCanonicalOrders',
      },
      paths: {
        cell: 'systems/orders/src/cells/queries/list-canonical-orders/cell.ts',
        contracts: [
          'systems/orders/src/cells/queries/list-canonical-orders/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/queries/list-canonical-orders/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/queries/list-canonical-orders/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/queries/list-canonical-orders/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/queries/list-canonical-orders/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/queries/list-canonical-orders/contract.spec.ts',
          'systems/orders/src/cells/queries/list-canonical-orders/execute.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/queries/list-canonical-orders/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one business-scoped page query and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/queries/list-canonical-orders/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'validates page bounds and normalizes the search term purely',
                proves: ['decision'],
              },
              {
                name: 'executes the normalized scoped list query with an explicit null cursor',
                proves: ['executor-success'],
              },
              {
                name: 'returns order_cursor_invalid before executing the repository',
                proves: ['decision'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.list_canonical_orders',
    },
    {
      id: 'orders.list-incoming-order-proposals.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'listIncomingOrderProposalsCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'listIncomingOrderProposals',
      },
      paths: {
        cell: 'systems/orders/src/cells/intake/list-incoming-order-proposals/cell.ts',
        contracts: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/types.ts',
        ],
        events: [],
        protocols: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/intake/list-incoming-order-proposals/contract.spec.ts',
          'systems/orders/src/cells/intake/list-incoming-order-proposals/execute.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/orders/src/cells/intake/list-incoming-order-proposals/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict proposal query and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/list-incoming-order-proposals/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'validates bounds and round-trips the view-bound keyset cursor purely',
                proves: ['decision'],
              },
              {
                name: 'executes the validated proposal query with an explicit decoded cursor',
                proves: ['executor-success'],
              },
              {
                name: 'rejects an invalid incoming-proposal cursor without querying the repository',
                proves: ['decision'],
              },
              {
                name: 'declares and presents the exact incoming-proposal list HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/order-management/locations/:locationId/incoming-orders',
          contextRequirements: [],
          boundaryProfile: 'orders-list-incoming-order-proposals-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'orders.list_incoming_order_proposals',
    },
    {
      id: 'orders.measure-order-outbox-backlog.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'measureOrderOutboxBacklogCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'measureOrderOutboxBacklog',
      },
      paths: {
        cell: 'systems/orders/src/cells/outbox/measure-order-outbox-backlog/cell.ts',
        contracts: [
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/contract.spec.ts',
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/execute.spec.ts',
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/operation.spec.ts',
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/postgres.int.spec.ts',
          'systems/orders/src/cells/outbox/measure-order-outbox-backlog/project.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/outbox/measure-order-outbox-backlog/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the empty query and nonnegative backlog measurement',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/measure-order-outbox-backlog/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'measures stored backlog once and projects its age from the injected clock',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/measure-order-outbox-backlog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'measures only unfinished rows from creation age and uses zero for an empty backlog',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.measure_order_outbox_backlog',
    },
    {
      id: 'orders.propose-incoming-order.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'proposeIncomingOrderCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'proposeIncomingOrder',
      },
      paths: {
        cell: 'systems/orders/src/cells/intake/propose-incoming-order/cell.ts',
        contracts: [
          'systems/orders/src/cells/intake/propose-incoming-order/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/intake/propose-incoming-order/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/intake/propose-incoming-order/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/intake/propose-incoming-order/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/intake/propose-incoming-order/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/intake/propose-incoming-order/cell.spec.ts',
          'systems/orders/src/cells/intake/propose-incoming-order/contract.spec.ts',
          'systems/orders/src/cells/intake/propose-incoming-order/execute.spec.ts',
          'systems/orders/src/cells/intake/propose-incoming-order/operation.spec.ts',
          'systems/orders/src/cells/intake/propose-incoming-order/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/intake/propose-incoming-order/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves the immutable source snapshot and typed timestamps on the wire',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/propose-incoming-order/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts a complete submitted snapshot and rejects an empty source purely',
                proves: ['decision'],
              },
              {
                name: 'locks source identity and creates exactly one proposal when no prior authority exists',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/propose-incoming-order/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one exact immutable incoming Order proposal',
                proves: ['postgres-commit'],
              },
              {
                name: 'replays the same source observation with its stable proposal identity',
                proves: ['same-payload-replay'],
              },
              {
                name: 'serializes concurrent proposals for the same source identity to one row',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
              {
                name: 'rejects a late proposal after terminal source evidence without a partial write',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'preserves the canonical Order as the single writer when its source link already exists',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rolls back a failed proposal insert without durable residue',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.propose_incoming_order',
    },
    {
      id: 'orders.reject-incoming-order-proposal.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'rejectIncomingOrderProposalCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'rejectIncomingOrderProposal',
      },
      paths: {
        cell: 'systems/orders/src/cells/intake/reject-incoming-order-proposal/cell.ts',
        contracts: [
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/types.ts',
        ],
        events: [],
        protocols: [
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/contract.spec.ts',
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/execute.spec.ts',
          'systems/orders/src/cells/intake/reject-incoming-order-proposal/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/orders/src/cells/intake/reject-incoming-order-proposal/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict optimistic rejection and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/reject-incoming-order-proposal/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'forwards the exact rejection command and preserves the rejected proposal identity',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact proposal-rejection HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/reject-incoming-order-proposal/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes rejection replay, rejects divergent and decided commands, and rolls back proposal transition and resolution together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                ],
              },
              {
                name: 'returns the exact reject-invalid failure without changing durable proposal state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'returns the exact proposal-not-found failure without writing a rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'returns the exact proposal-version conflict without changing proposal state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/incoming-orders/:proposalId/reject',
          contextRequirements: ['order-management-principal'],
          boundaryProfile: 'orders-reject-incoming-order-proposal-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'orders.reject_incoming_order_proposal',
    },
    {
      id: 'orders.release-fulfillment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'releaseFulfillmentCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'releaseFulfillment',
      },
      paths: {
        cell: 'systems/orders/src/cells/fulfillment/release-fulfillment/cell.ts',
        contracts: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/types.ts',
        ],
        events: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/events.ts',
        ],
        protocols: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/fulfillment/release-fulfillment/contract.spec.ts',
          'systems/orders/src/cells/fulfillment/release-fulfillment/execute.spec.ts',
          'systems/orders/src/cells/fulfillment/release-fulfillment/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/fulfillment/release-fulfillment/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict fulfillment release and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/fulfillment/release-fulfillment/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts releasable evidence and rejects an invalid fulfillment version purely',
                proves: ['decision'],
              },
              {
                name: 'executes release only after validation and preserves the writer result',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact fulfillment-release HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/fulfillment/release-fulfillment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes release replay, rejects divergent and stale commands, and rolls back fulfillment, Order, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/fulfillment/release-fulfillment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects fulfillment_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects fulfillment_transition_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/release',
          contextRequirements: [
            'order-management-business-id',
            'order-management-principal',
          ],
          boundaryProfile: 'orders-release-fulfillment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.release_fulfillment',
    },
    {
      id: 'orders.restore-incoming-order-proposal.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'restoreIncomingOrderProposalCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'restoreIncomingOrderProposal',
      },
      paths: {
        cell: 'systems/orders/src/cells/intake/restore-incoming-order-proposal/cell.ts',
        contracts: [
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/types.ts',
        ],
        events: [],
        protocols: [
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/contract.spec.ts',
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/execute.spec.ts',
          'systems/orders/src/cells/intake/restore-incoming-order-proposal/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/orders/src/cells/intake/restore-incoming-order-proposal/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict optimistic restoration and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/restore-incoming-order-proposal/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'forwards the exact restoration command and preserves the restored version',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact proposal-restoration HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/intake/restore-incoming-order-proposal/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes restoration replay, rejects divergent and decided commands, and rolls back proposal state and transition together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                ],
              },
              {
                name: 'returns the exact restore-invalid failure without changing durable proposal state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'returns the exact proposal-not-found failure without writing a restoration',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'returns the exact proposal-version conflict without changing proposal state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/incoming-orders/:proposalId/restore',
          contextRequirements: ['order-management-principal'],
          boundaryProfile: 'orders-restore-incoming-order-proposal-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'orders.restore_incoming_order_proposal',
    },
    {
      id: 'orders.retry-order-outbox.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'retryOrderOutboxCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'retryOrderOutbox',
      },
      paths: {
        cell: 'systems/orders/src/cells/outbox/retry-order-outbox/cell.ts',
        contracts: [
          'systems/orders/src/cells/outbox/retry-order-outbox/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/orders/src/cells/outbox/retry-order-outbox/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/outbox/retry-order-outbox/postgres.ts',
        ],
        state: ['systems/orders/src/cells/outbox/retry-order-outbox/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/orders/src/cells/outbox/retry-order-outbox/contract.spec.ts',
          'systems/orders/src/cells/outbox/retry-order-outbox/execute.spec.ts',
          'systems/orders/src/cells/outbox/retry-order-outbox/operation.spec.ts',
          'systems/orders/src/cells/outbox/retry-order-outbox/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/outbox/retry-order-outbox/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips retry scheduling with an exact UTC availability time',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/retry-order-outbox/operation.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'passes the exact retry time and error evidence to persistence',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/outbox/retry-order-outbox/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns only the current owner to pending at the requested retry time',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'rolls back retry scheduling when PostgreSQL rejects the state update',
                proves: ['unexpected-failure-rollback'],
              },
              {
                name: 'serializes concurrent retry attempts through the lease-owner fence',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.retry_order_outbox',
    },
    {
      id: 'orders.withdraw-fulfillment.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'orders',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/orders-system',
        manifestExportName: 'withdrawFulfillmentCellDeclaration',
        assemblyExportName: 'makeOrdersSystem',
        assemblyKey: 'withdrawFulfillment',
      },
      paths: {
        cell: 'systems/orders/src/cells/fulfillment/withdraw-fulfillment/cell.ts',
        contracts: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/contract.ts',
        ],
        decisions: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/decide.ts',
        ],
        executors: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/execute.ts',
        ],
        persistence: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/postgres.ts',
        ],
        state: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/types.ts',
        ],
        events: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/events.ts',
        ],
        protocols: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/http.ts',
        ],
        tests: [
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/contract.spec.ts',
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/execute.spec.ts',
          'systems/orders/src/cells/fulfillment/withdraw-fulfillment/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/orders/src/cells/fulfillment/withdraw-fulfillment/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips one strict fulfillment withdrawal and rejects undeclared fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/fulfillment/withdraw-fulfillment/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'accepts withdrawal evidence and rejects an invalid fulfillment version purely',
                proves: ['decision'],
              },
              {
                name: 'executes withdrawal only after validation and preserves the writer result',
                proves: ['executor-success'],
              },
              {
                name: 'declares and presents the exact fulfillment-withdrawal HTTP protocol',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/fulfillment/withdraw-fulfillment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes withdrawal replay, rejects divergent and stale commands, and rolls back fulfillment, Order, receipt and outbox together',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'unexpected-failure-rollback',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                  'state-message-atomicity',
                  'message-compatibility',
                ],
              },
            ],
          },
          {
            path: 'systems/orders/src/cells/fulfillment/withdraw-fulfillment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects fulfillment_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects fulfillment_transition_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'orders:manage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/order-management/locations/:locationId/fulfillments/:fulfillmentId/withdraw',
          contextRequirements: [
            'order-management-business-id',
            'order-management-principal',
          ],
          boundaryProfile: 'orders-withdraw-fulfillment-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: ['fulfillment_demand_changed.v2'],
      consumes: [],
      experienceConsumers: [],
      observability: 'orders.withdraw_fulfillment',
    },
    {
      id: 'pricing.load-pricing-catalog.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'pricing',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/pricing-system',
        manifestExportName: 'loadPricingCatalogCellDeclaration',
        assemblyExportName: 'makePricingSystem',
        assemblyKey: 'loadPricingCatalog',
      },
      paths: {
        cell: 'systems/pricing/src/cells/catalog/load-pricing-catalog/cell.ts',
        contracts: [
          'systems/pricing/src/cells/catalog/load-pricing-catalog/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/pricing/src/cells/catalog/load-pricing-catalog/execute.ts',
        ],
        persistence: [
          'systems/pricing/src/cells/catalog/load-pricing-catalog/postgres.ts',
        ],
        state: [
          'systems/pricing/src/cells/catalog/load-pricing-catalog/types.ts',
        ],
        events: [],
        protocols: [
          'systems/pricing/src/cells/catalog/load-pricing-catalog/http.ts',
        ],
        tests: [
          'systems/pricing/src/cells/catalog/load-pricing-catalog/load-pricing-catalog.spec.ts',
          'systems/pricing/src/cells/catalog/load-pricing-catalog/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'customer.web.pricing',
            experience: 'customer',
            path: 'experiences/customer/src/web/features/pricing/feature.ts',
            uses: ['pricing.load-pricing-catalog.v1'],
            stateProofs: [
              'experiences/customer/src/web/features/pricing/pricing-interaction.test.tsx',
            ],
            componentProofs: [
              'experiences/customer/src/web/features/pricing/pricing-interaction.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/pricing/src/cells/catalog/load-pricing-catalog/load-pricing-catalog.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the strict public catalog contract and GET protocol',
                proves: ['contract', 'protocol'],
              },
              {
                name: 'returns pricing_not_found as typed query data',
                proves: ['executor-success'],
              },
              {
                name: 'executes and serializes an empty catalog as success',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/pricing/src/cells/catalog/load-pricing-catalog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'stable_catalog_projection_and_empty_state',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/pricing/services/:serviceSlug/pricing',
          contextRequirements: [],
          boundaryProfile: 'api-pricing-public-read-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['customer'],
      observability: 'pricing.load_pricing_catalog',
    },
    {
      id: 'pricing.plan-pricing-change.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'pricing',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/pricing-system',
        manifestExportName: 'planPricingChangeCellDeclaration',
        assemblyExportName: 'makePricingSystem',
        assemblyKey: 'planPricingChange',
      },
      paths: {
        cell: 'systems/pricing/src/cells/pricebook/plan-pricing-change/cell.ts',
        contracts: [
          'systems/pricing/src/cells/pricebook/plan-pricing-change/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/pricing/src/cells/pricebook/plan-pricing-change/execute.ts',
        ],
        persistence: [],
        state: [
          'systems/pricing/src/cells/pricebook/plan-pricing-change/types.ts',
        ],
        events: [],
        protocols: [
          'systems/pricing/src/cells/pricebook/plan-pricing-change/http.ts',
        ],
        tests: [
          'systems/pricing/src/cells/pricebook/plan-pricing-change/plan-pricing-change.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/pricing/src/cells/pricebook/plan-pricing-change/plan-pricing-change.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the authenticated non-writing HTTP contract',
                proves: ['contract', 'protocol'],
              },
              {
                name: 'decides policy violations and exact changed-item bytes',
                proves: ['decision'],
              },
              {
                name: 'executes a valid plan without any write capability',
                proves: ['executor-success'],
              },
              {
                name: 'maps authenticated host context into protocol input',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/pricing/src/cells/pricebook/plan-pricing-change/plan-pricing-change.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns pricing_service_not_found from the authoritative reader',
                proves: ['executor-success'],
              },
              {
                name: 'returns active_pricing_set_not_found from the authoritative reader',
                proves: ['executor-success'],
              },
              {
                name: 'returns multiple_active_pricing_sets from the authoritative reader',
                proves: ['executor-success'],
              },
              {
                name: 'returns active_pricing_set_has_no_items from the authoritative reader',
                proves: ['executor-success'],
              },
              {
                name: 'returns pricing_item_code_not_found for an unknown item',
                proves: ['decision'],
              },
              {
                name: 'returns pricing_change_has_no_changes for an identical price',
                proves: ['decision'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'pricing:plan',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/pricing/changes/plan',
          contextRequirements: ['pricing-change-author'],
          boundaryProfile: 'api-pricing-change-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'pricing.plan_pricing_change',
    },
    {
      id: 'pricing.publish-pricing-change.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'pricing',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/pricing-system',
        manifestExportName: 'publishPricingChangeCellDeclaration',
        assemblyExportName: 'makePricingSystem',
        assemblyKey: 'publishPricingChange',
      },
      paths: {
        cell: 'systems/pricing/src/cells/pricebook/publish-pricing-change/cell.ts',
        contracts: [
          'systems/pricing/src/cells/pricebook/publish-pricing-change/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/pricing/src/cells/pricebook/publish-pricing-change/execute.ts',
        ],
        persistence: [
          'systems/pricing/src/cells/pricebook/publish-pricing-change/postgres.ts',
        ],
        state: [
          'systems/pricing/src/cells/pricebook/publish-pricing-change/types.ts',
        ],
        events: [],
        protocols: [
          'systems/pricing/src/cells/pricebook/publish-pricing-change/http.ts',
        ],
        tests: [
          'systems/pricing/src/cells/pricebook/publish-pricing-change/postgres.int.spec.ts',
          'systems/pricing/src/cells/pricebook/publish-pricing-change/publish-pricing-change.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/pricing/src/cells/pricebook/publish-pricing-change/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commit_success',
                proves: ['postgres-commit'],
              },
              {
                name: 'optimistic_concurrency_fence',
                proves: ['declared-concurrency-race'],
              },
              {
                name: 'expected_replay_rejection',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'unexpected_failure_rollback',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/pricing/src/cells/pricebook/publish-pricing-change/publish-pricing-change.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the service-partitioned publish contract and protocol',
                proves: ['contract', 'protocol'],
              },
              {
                name: 'executes the exact author clock and recomputed plan once',
                proves: ['executor-success'],
              },
              {
                name: 'decides invalid current state before publish effects',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/pricing/src/cells/pricebook/publish-pricing-change/publish-pricing-change.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns pricing_service_not_found without publishing',
                proves: ['executor-success'],
              },
              {
                name: 'returns active_pricing_set_not_found without publishing',
                proves: ['executor-success'],
              },
              {
                name: 'returns multiple_active_pricing_sets without publishing',
                proves: ['executor-success'],
              },
              {
                name: 'returns active_pricing_set_has_no_items without publishing',
                proves: ['executor-success'],
              },
              {
                name: 'returns duplicate_pricing_item_code without publishing',
                proves: ['decision'],
              },
              {
                name: 'returns invalid_pricing_item_price without publishing',
                proves: ['decision'],
              },
              {
                name: 'returns pricing_item_code_not_found without publishing',
                proves: ['decision'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'pricing:publish',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/pricing/changes/publish',
          contextRequirements: ['pricing-change-author'],
          boundaryProfile: 'api-pricing-change-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'pricing.publish_pricing_change',
    },
    {
      id: 'processor.auth-login.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'processorLoginCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'login',
      },
      paths: {
        cell: 'experiences/processor/src/cells/auth/auth-login/cell.ts',
        contracts: [
          'experiences/processor/src/cells/auth/auth-login/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/auth/auth-login/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/processor/src/cells/auth/auth-login/http.ts'],
        tests: ['experiences/processor/src/cells/auth/auth-login/cell.test.ts'],
        features: [
          {
            id: 'processor.authentication',
            experience: 'processor',
            path: 'experiences/processor/src/features/authentication/feature.ts',
            uses: [
              'processor.auth-login.v1',
              'processor.complete-mfa-challenge.v1',
              'processor.load-auth-session.v1',
              'processor.logout.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/auth/auth-login/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'auth login preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'returns every finite authentication failure kind without narrowing diagnostic codes',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/processor/auth/login',
          contextRequirements: ['request-metadata'],
          boundaryProfile: 'processor-auth-login-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.authentication.login',
    },
    {
      id: 'processor.complete-mfa-challenge.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'processorCompleteMfaChallengeCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'completeMfaChallenge',
      },
      paths: {
        cell: 'experiences/processor/src/cells/auth/complete-mfa-challenge/cell.ts',
        contracts: [
          'experiences/processor/src/cells/auth/complete-mfa-challenge/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/auth/complete-mfa-challenge/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/auth/complete-mfa-challenge/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/auth/complete-mfa-challenge/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.authentication',
            experience: 'processor',
            path: 'experiences/processor/src/features/authentication/feature.ts',
            uses: [
              'processor.auth-login.v1',
              'processor.complete-mfa-challenge.v1',
              'processor.load-auth-session.v1',
              'processor.logout.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/auth/complete-mfa-challenge/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'complete mfa challenge preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'returns every finite authentication failure kind without narrowing diagnostic codes',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/processor/auth/mfa/challenge',
          contextRequirements: ['processor-mfa-cookie', 'request-metadata'],
          boundaryProfile: 'processor-complete-mfa-challenge-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.authentication.complete_mfa_challenge',
    },
    {
      id: 'processor.list-production-history-activity.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName:
          'listProcessorProductionHistoryActivityCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'listHistoryActivity',
      },
      paths: {
        cell: 'experiences/processor/src/cells/history/list-production-history-activity/cell.ts',
        contracts: [
          'experiences/processor/src/cells/history/list-production-history-activity/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/history/list-production-history-activity/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/history/list-production-history-activity/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/history/list-production-history-activity/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.history',
            experience: 'processor',
            path: 'experiences/processor/src/features/history/feature.ts',
            uses: [
              'processor.list-production-history-activity.v1',
              'processor.load-production-history-run.v1',
              'production.list-history-plans.v1',
              'production.list-history-runs.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/history/list-production-history-activity/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list production history activity preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/history/activity',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.list_production_history_activity',
    },
    {
      id: 'processor.list-production-order-control.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName:
          'listProcessorProductionOrderControlCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'listOrderControl',
      },
      paths: {
        cell: 'experiences/processor/src/cells/orders/list-production-order-control/cell.ts',
        contracts: [
          'experiences/processor/src/cells/orders/list-production-order-control/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/orders/list-production-order-control/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/orders/list-production-order-control/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/orders/list-production-order-control/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.intake',
            experience: 'processor',
            path: 'experiences/processor/src/features/intake/feature.ts',
            uses: [
              'processor.list-production-order-control.v1',
              'production.change-admission.v1',
              'production.record-order-intake.v1',
              'production.set-order-priority.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
          },
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/orders/list-production-order-control/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'list production order control preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/order-control',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.list_production_order_control',
    },
    {
      id: 'processor.load-auth-session.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'processorLoadSessionCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'loadSession',
      },
      paths: {
        cell: 'experiences/processor/src/cells/auth/load-auth-session/cell.ts',
        contracts: [
          'experiences/processor/src/cells/auth/load-auth-session/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/auth/load-auth-session/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/auth/load-auth-session/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/auth/load-auth-session/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.authentication',
            experience: 'processor',
            path: 'experiences/processor/src/features/authentication/feature.ts',
            uses: [
              'processor.auth-login.v1',
              'processor.complete-mfa-challenge.v1',
              'processor.load-auth-session.v1',
              'processor.logout.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/auth/load-auth-session/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load auth session preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'returns every finite authentication failure kind without narrowing diagnostic codes',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/processor/auth/session',
          contextRequirements: ['processor-session-cookie', 'request-metadata'],
          boundaryProfile: 'processor-load-auth-session-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.authentication.load_session',
    },
    {
      id: 'processor.load-production-board.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'loadProcessorProductionBoardCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'loadBoard',
      },
      paths: {
        cell: 'experiences/processor/src/cells/production/load-production-board/cell.ts',
        contracts: [
          'experiences/processor/src/cells/production/load-production-board/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/production/load-production-board/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/production/load-production-board/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/production/load-production-board/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.production-board',
            experience: 'processor',
            path: 'experiences/processor/src/features/production-board/feature.ts',
            uses: [
              'processor.load-production-board.v1',
              'production.advance-stage.v1',
              'production.assign-stage-machines.v1',
              'production.freeze-batch-membership.v1',
              'production.reconcile-batch-progress.v1',
              'production.unfreeze-batch-membership.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/production/load-production-board/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load production board preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/runs/:productionRunId/board',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.load_production_board',
    },
    {
      id: 'processor.load-production-history-run.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'loadProcessorProductionHistoryRunCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'loadHistoryRun',
      },
      paths: {
        cell: 'experiences/processor/src/cells/history/load-production-history-run/cell.ts',
        contracts: [
          'experiences/processor/src/cells/history/load-production-history-run/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/history/load-production-history-run/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/history/load-production-history-run/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/history/load-production-history-run/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.history',
            experience: 'processor',
            path: 'experiences/processor/src/features/history/feature.ts',
            uses: [
              'processor.list-production-history-activity.v1',
              'processor.load-production-history-run.v1',
              'production.list-history-plans.v1',
              'production.list-history-runs.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/history/load-production-history-run/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load production history run preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/history/runs/:productionRunId',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.load_production_history_run',
    },
    {
      id: 'processor.load-production-workspace.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'loadProcessorProductionWorkspaceCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'loadWorkspace',
      },
      paths: {
        cell: 'experiences/processor/src/cells/production/load-production-workspace/cell.ts',
        contracts: [
          'experiences/processor/src/cells/production/load-production-workspace/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/production/load-production-workspace/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/production/load-production-workspace/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/production/load-production-workspace/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/production/load-production-workspace/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load production workspace preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/workspace',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.load_production_workspace',
    },
    {
      id: 'processor.load-remaining-day-forecast.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'loadProcessorRemainingDayForecastCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'loadRemainingDayForecast',
      },
      paths: {
        cell: 'experiences/processor/src/cells/forecast/load-remaining-day-forecast/cell.ts',
        contracts: [
          'experiences/processor/src/cells/forecast/load-remaining-day-forecast/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/forecast/load-remaining-day-forecast/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/forecast/load-remaining-day-forecast/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/forecast/load-remaining-day-forecast/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.forecast',
            experience: 'processor',
            path: 'experiences/processor/src/features/forecast/feature.ts',
            uses: ['processor.load-remaining-day-forecast.v1'],
            stateProofs: [
              'experiences/processor/src/features/forecast/forecast.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/forecast/forecast.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/forecast/load-remaining-day-forecast/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'load remaining day forecast preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/forecast',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.load_remaining_day_forecast',
    },
    {
      id: 'processor.logout.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'processorLogoutCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'logout',
      },
      paths: {
        cell: 'experiences/processor/src/cells/auth/logout/cell.ts',
        contracts: ['experiences/processor/src/cells/auth/logout/contract.ts'],
        decisions: [],
        executors: ['experiences/processor/src/cells/auth/logout/execute.ts'],
        persistence: [],
        state: [],
        events: [],
        protocols: ['experiences/processor/src/cells/auth/logout/http.ts'],
        tests: ['experiences/processor/src/cells/auth/logout/cell.test.ts'],
        features: [
          {
            id: 'processor.authentication',
            experience: 'processor',
            path: 'experiences/processor/src/features/authentication/feature.ts',
            uses: [
              'processor.auth-login.v1',
              'processor.complete-mfa-challenge.v1',
              'processor.load-auth-session.v1',
              'processor.logout.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/authentication/authentication.view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/auth/logout/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'logout preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'returns every finite authentication failure kind without narrowing diagnostic codes',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/processor/auth/logout',
          contextRequirements: ['processor-session-cookie', 'request-metadata'],
          boundaryProfile: 'processor-logout-v1-http',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.authentication.logout',
    },
    {
      id: 'processor.preview-production-order-backlog.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName:
          'previewProcessorProductionOrderBacklogCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'previewOrderBacklog',
      },
      paths: {
        cell: 'experiences/processor/src/cells/production/preview-production-order-backlog/cell.ts',
        contracts: [
          'experiences/processor/src/cells/production/preview-production-order-backlog/contract.ts',
        ],
        decisions: [],
        executors: [
          'experiences/processor/src/cells/production/preview-production-order-backlog/execute.ts',
        ],
        persistence: [],
        state: [],
        events: [],
        protocols: [
          'experiences/processor/src/cells/production/preview-production-order-backlog/http.ts',
        ],
        tests: [
          'experiences/processor/src/cells/production/preview-production-order-backlog/cell.test.ts',
        ],
        features: [
          {
            id: 'processor.order-resolution',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-resolution/feature.ts',
            uses: [
              'processor.preview-production-order-backlog.v1',
              'production.change-order-resolution.v1',
              'production.commit-order-backlog.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'experiences/processor/src/cells/production/preview-production-order-backlog/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preview production order backlog preserves its contract, protocol, and successful capability execution',
                proves: ['contract', 'protocol', 'executor-success'],
              },
              {
                name: 'preserves arbitrary upstream diagnostics under a finite query-failure reason',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/order-backlog/preview',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-resource-command-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'processor.preview_production_order_backlog',
    },
    {
      id: 'processor.resolve-access.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'processor',
      ownerKind: 'experience',
      source: {
        moduleSpecifier: '@pressly/experience-processor/server',
        manifestExportName: 'resolveProcessorAccessCellDeclaration',
        assemblyExportName: 'makeProcessorExperience',
        assemblyKey: 'resolveAccess',
      },
      paths: {
        cell: 'experiences/processor/src/cells/access/resolve-access/cell.ts',
        contracts: [
          'experiences/processor/src/cells/access/resolve-access/contract.ts',
        ],
        decisions: [
          'experiences/processor/src/cells/access/resolve-access/policy.ts',
        ],
        executors: [
          'experiences/processor/src/cells/access/resolve-access/execute.ts',
        ],
        persistence: [],
        state: [
          'experiences/processor/src/cells/access/resolve-access/model.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'experiences/processor/src/cells/access/resolve-access/cell.test.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'experiences/processor/src/cells/access/resolve-access/cell.test.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'resolve access rejects an empty production scope and executes a visible scope',
                proves: [
                  'contract',
                  'decision',
                  'protocol',
                  'executor-success',
                ],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'processor.resolve_access',
    },
    {
      id: 'production.accept-schedule.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'acceptScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'acceptSchedule',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/accept-schedule/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/accept-schedule/boundary.ts',
          'systems/production/src/cells/scheduling/accept-schedule/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/accept-schedule/decide.ts',
          'systems/production/src/cells/scheduling/accept-schedule/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/accept-schedule/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/accept-schedule/postgres.ts',
          'systems/production/src/cells/scheduling/accept-schedule/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/accept-schedule/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/accept-schedule/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/accept-schedule/cell.spec.ts',
          'systems/production/src/cells/scheduling/accept-schedule/contract.spec.ts',
          'systems/production/src/cells/scheduling/accept-schedule/decide.spec.ts',
          'systems/production/src/cells/scheduling/accept-schedule/execute.spec.ts',
          'systems/production/src/cells/scheduling/accept-schedule/http.spec.ts',
          'systems/production/src/cells/scheduling/accept-schedule/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the strict request without sorting warning acknowledgements',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'evaluates Accept against the persisted snapshot window',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves replay, lock, row, policy, snapshot, and atomic accept order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body then params validation before actor context',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'accepts once, sorts persisted warnings, replays, and treats caller order as idempotent identity',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'uses the after-lock replay to collapse concurrent identical acceptance',
                proves: ['same-key-concurrency'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes different-key acceptance so one succeeds and one sees non-draft state',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_shift_window_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_warning_acknowledgement_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_has_no_batches without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects batch_capacity_exceeded without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects batch_stage_count_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects batch_has_no_orders without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects batch_stage_order_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects stage_pulse_mismatch without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects batch_stage_gap_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects order_split_across_batches without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_not_current without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/accept-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back schedule acceptance when the late receipt append fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:accept',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/schedules/:scheduleRunId/accept',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.accept_schedule',
    },
    {
      id: 'production.advance-stage.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'advanceStageCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'advanceStage',
      },
      paths: {
        cell: 'systems/production/src/cells/floor/advance-stage/cell.ts',
        contracts: [
          'systems/production/src/cells/floor/advance-stage/boundary.ts',
          'systems/production/src/cells/floor/advance-stage/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/floor/advance-stage/confirmation.ts',
          'systems/production/src/cells/floor/advance-stage/decide.ts',
          'systems/production/src/cells/floor/advance-stage/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/floor/advance-stage/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/floor/advance-stage/complete-attempts.postgres.ts',
          'systems/production/src/cells/floor/advance-stage/complete-batch.postgres.ts',
          'systems/production/src/cells/floor/advance-stage/load-facts.postgres.ts',
          'systems/production/src/cells/floor/advance-stage/postgres.ts',
          'systems/production/src/cells/floor/advance-stage/work-event.postgres.ts',
        ],
        state: ['systems/production/src/cells/floor/advance-stage/types.ts'],
        events: [],
        protocols: ['systems/production/src/cells/floor/advance-stage/http.ts'],
        tests: [
          'systems/production/src/cells/floor/advance-stage/cell.spec.ts',
          'systems/production/src/cells/floor/advance-stage/confirmation.spec.ts',
          'systems/production/src/cells/floor/advance-stage/contract.spec.ts',
          'systems/production/src/cells/floor/advance-stage/decide.spec.ts',
          'systems/production/src/cells/floor/advance-stage/execute.spec.ts',
          'systems/production/src/cells/floor/advance-stage/idempotency.spec.ts',
          'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.production-board',
            experience: 'processor',
            path: 'experiences/processor/src/features/production-board/feature.ts',
            uses: [
              'processor.load-production-board.v1',
              'production.advance-stage.v1',
              'production.assign-stage-machines.v1',
              'production.freeze-batch-membership.v1',
              'production.reconcile-batch-progress.v1',
              'production.unfreeze-batch-membership.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/floor/advance-stage/cell.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares only the two current literal POST routes with staged auth and 64kb bodies',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes and re-encodes the current start request as an authenticated command',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'is deterministic from explicit facts, command, policy, and time without mutation',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'executes the exact linear protocol and signals only after commit',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits stage, batch, queue, receipt, event, revision, and post-commit signal once',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays an identical command without a second write or signal',
                proves: ['same-payload-replay', 'same-key-concurrency'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects a different payload under the committed idempotency key',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'allows one same-version command and rejects its concurrent competitor',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/advance-stage/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back stage and assignment updates for a late typed batch conflict',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:stage',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/stages/:stageRunId/start',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-before-input-v1',
        },
        {
          method: 'POST',
          path: '/production/locations/:locationId/stages/:stageRunId/complete',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-before-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.advance_stage',
    },
    {
      id: 'production.apply-fulfillment-demand.v1',
      kind: 'reaction',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'applyFulfillmentDemandCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'applyFulfillmentDemand',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/apply-fulfillment-demand/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/decide.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/types.ts',
        ],
        events: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/message.ts',
        ],
        protocols: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/job.ts',
        ],
        tests: [
          'systems/production/src/cells/demand/apply-fulfillment-demand/cell.spec.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/contract.spec.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/decide.spec.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/execute.spec.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/idempotency.spec.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/job-delivery.spec.ts',
          'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/cell.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'is a selected message reaction over the exact external Orders event identity',
                proves: ['protocol', 'message-compatibility'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact mapped Production command and result',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns the exact execution-state conflict instead of throwing',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves replay, validation, read, lock, ID, clock, mutation, and event order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'preserves a typed not_found rollback without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'creates demand and intake-pending work with exact IDs, receipt, revision, replay,',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'state-message-atomicity',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects semantic input and missing or inactive locations before IDs, clock, locks, or writes',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'audits older and equal fresh keys without clock, but rejects same-version divergence without an event',
                proves: ['divergent-key-conflict'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes concurrent same-version divergence to one durable winner',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls the earlier demand update back on a late production-order CAS miss',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/apply-fulfillment-demand/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical fulfillment delivery to one durable projection',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [
        {
          id: 'production.apply-fulfillment-demand-job.v2',
          trigger: 'message',
        },
      ],
      eventStreams: [],
      emits: [],
      consumes: ['fulfillment_demand_changed.v2'],
      experienceConsumers: [],
      observability: 'production.apply_fulfillment_demand',
    },
    {
      id: 'production.assign-stage-machines.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'assignStageMachinesCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'assignStageMachines',
      },
      paths: {
        cell: 'systems/production/src/cells/floor/assign-stage-machines/cell.ts',
        contracts: [
          'systems/production/src/cells/floor/assign-stage-machines/boundary.ts',
          'systems/production/src/cells/floor/assign-stage-machines/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/floor/assign-stage-machines/decide.ts',
          'systems/production/src/cells/floor/assign-stage-machines/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/floor/assign-stage-machines/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/floor/assign-stage-machines/load-context.postgres.ts',
          'systems/production/src/cells/floor/assign-stage-machines/postgres.ts',
          'systems/production/src/cells/floor/assign-stage-machines/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/floor/assign-stage-machines/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/floor/assign-stage-machines/http.ts',
        ],
        tests: [
          'systems/production/src/cells/floor/assign-stage-machines/cell.spec.ts',
          'systems/production/src/cells/floor/assign-stage-machines/contract.spec.ts',
          'systems/production/src/cells/floor/assign-stage-machines/decide.spec.ts',
          'systems/production/src/cells/floor/assign-stage-machines/execute.spec.ts',
          'systems/production/src/cells/floor/assign-stage-machines/http.spec.ts',
          'systems/production/src/cells/floor/assign-stage-machines/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.production-board',
            experience: 'processor',
            path: 'experiences/processor/src/features/production-board/feature.ts',
            uses: [
              'processor.load-production-board.v1',
              'production.advance-stage.v1',
              'production.assign-stage-machines.v1',
              'production.freeze-batch-membership.v1',
              'production.reconcile-batch-progress.v1',
              'production.unfreeze-batch-membership.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact serialized command',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns the canonical machine assignment',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'runs one locked, audited assignment protocol',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body-before-params failure precedence',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits once, advances live revision, and replays',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version assignments so exactly one commits',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/assign-stage-machines/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns typed not-found without writing assignment state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects divergent assignment reuse without changing the committed graph',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'collapses concurrent identical assignment commands after the locked context',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'rolls back assignment and stage version when the late event insert fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:stage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PUT',
          path: '/production/locations/:locationId/stages/:stageRunId/machines',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.assign_stage_machines',
    },
    {
      id: 'production.attempt-automatic-placement.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'attemptAutomaticPlacementCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'attemptAutomaticPlacement',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/attempt-automatic-placement/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/attempt-automatic-placement/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/attempt-automatic-placement/decide.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/attempt-automatic-placement/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/attempt-automatic-placement/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/scheduling/attempt-automatic-placement/cell.spec.ts',
          'systems/production/src/cells/scheduling/attempt-automatic-placement/contract.spec.ts',
          'systems/production/src/cells/scheduling/attempt-automatic-placement/decide.spec.ts',
          'systems/production/src/cells/scheduling/attempt-automatic-placement/execute.spec.ts',
          'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips both internal Production capabilities and rejects unknown fields',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'records the exact awaiting-run state when no run has started',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'records an awaiting-run outcome atomically',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'persists awaiting-run once, replays, and rejects divergence without partial state',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'propagates production_order_execution_event_not_allowed without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'propagates production_order_execution_state_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'propagates production_order_execution_transition_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'propagates production_placement_context_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'propagates production_placement_order_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'propagates production_placement_queue_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'propagates production_placement_stage_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'waits on the scheduling advisory lock before discovering the run',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent same-key pending attempts to one durable effect',
                proves: ['same-key-concurrency'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/attempt-automatic-placement/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back a delegated write when the placement mechanism throws',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'production.attempt_automatic_placement',
    },
    {
      id: 'production.change-admission.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'changeAdmissionCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'changeAdmission',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/change-admission/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/change-admission/boundary.ts',
          'systems/production/src/cells/demand/change-admission/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/change-admission/decide.ts',
          'systems/production/src/cells/demand/change-admission/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/change-admission/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/change-admission/postgres.ts',
          'systems/production/src/cells/demand/change-admission/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/change-admission/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/demand/change-admission/http.ts',
        ],
        tests: [
          'systems/production/src/cells/demand/change-admission/cell.spec.ts',
          'systems/production/src/cells/demand/change-admission/contract.spec.ts',
          'systems/production/src/cells/demand/change-admission/decide.spec.ts',
          'systems/production/src/cells/demand/change-admission/execute.spec.ts',
          'systems/production/src/cells/demand/change-admission/http.spec.ts',
          'systems/production/src/cells/demand/change-admission/idempotency.spec.ts',
          'systems/production/src/cells/demand/change-admission/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.intake',
            experience: 'processor',
            path: 'experiences/processor/src/features/intake/feature.ts',
            uses: [
              'processor.list-production-order-control.v1',
              'production.change-admission.v1',
              'production.record-order-intake.v1',
              'production.set-order-priority.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/change-admission/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the deployed request and trusted actor',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'derives the exact admitted status without effects',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves replay, location lock, row lock, CAS, and audit order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'keeps the exact route, body limit, and trusted actor context requirement',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits once, records the exact receipt, replays, and rejects divergent reuse',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version writes so exactly one commits',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back order and live revision when the event append fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-admission/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical admission commands after the location lock',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:admission',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PUT',
          path: '/production/locations/:locationId/orders/:productionOrderId/admission',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.change_admission',
    },
    {
      id: 'production.change-order-resolution.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'changeOrderResolutionCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'changeOrderResolution',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/change-order-resolution/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/change-order-resolution/boundary.ts',
          'systems/production/src/cells/demand/change-order-resolution/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/change-order-resolution/decide.ts',
          'systems/production/src/cells/demand/change-order-resolution/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/change-order-resolution/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/change-order-resolution/postgres.ts',
          'systems/production/src/cells/demand/change-order-resolution/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/change-order-resolution/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/demand/change-order-resolution/http.ts',
        ],
        tests: [
          'systems/production/src/cells/demand/change-order-resolution/cell.spec.ts',
          'systems/production/src/cells/demand/change-order-resolution/contract.spec.ts',
          'systems/production/src/cells/demand/change-order-resolution/decide.spec.ts',
          'systems/production/src/cells/demand/change-order-resolution/execute.spec.ts',
          'systems/production/src/cells/demand/change-order-resolution/http.spec.ts',
          'systems/production/src/cells/demand/change-order-resolution/idempotency.spec.ts',
          'systems/production/src/cells/demand/change-order-resolution/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-resolution',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-resolution/feature.ts',
            uses: [
              'processor.preview-production-order-backlog.v1',
              'production.change-order-resolution.v1',
              'production.commit-order-backlog.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips resolve including the trusted source precondition',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'resolves clean unassigned work through the resolution graph',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves two replay checks, lock order, CAS, and exact resolve event',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact route, limit, and actor context requirement',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'resolves once with exact receipt, replays, and rejects divergent reuse',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays concurrent identical commands after the location lock',
                proves: ['same-key-concurrency'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes distinct same-version commands so one wins',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/change-order-resolution/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back resolution and live revision after a late event failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PUT',
          path: '/production/locations/:locationId/orders/:productionOrderId/resolution',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.change_order_resolution',
    },
    {
      id: 'production.commit-order-backlog.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'commitOrderBacklogCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'commitOrderBacklog',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/commit-order-backlog/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/commit-order-backlog/boundary.ts',
          'systems/production/src/cells/demand/commit-order-backlog/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/commit-order-backlog/decide.ts',
          'systems/production/src/cells/demand/commit-order-backlog/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/commit-order-backlog/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/commit-order-backlog/postgres.ts',
          'systems/production/src/cells/demand/commit-order-backlog/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/commit-order-backlog/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/demand/commit-order-backlog/http.ts',
        ],
        tests: [
          'systems/production/src/cells/demand/commit-order-backlog/cell.spec.ts',
          'systems/production/src/cells/demand/commit-order-backlog/contract.spec.ts',
          'systems/production/src/cells/demand/commit-order-backlog/decide.spec.ts',
          'systems/production/src/cells/demand/commit-order-backlog/execute.spec.ts',
          'systems/production/src/cells/demand/commit-order-backlog/http.spec.ts',
          'systems/production/src/cells/demand/commit-order-backlog/idempotency.spec.ts',
          'systems/production/src/cells/demand/commit-order-backlog/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-resolution',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-resolution/feature.ts',
            uses: [
              'processor.preview-production-order-backlog.v1',
              'production.change-order-resolution.v1',
              'production.commit-order-backlog.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-resolution/order-resolution-review.container.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the strict request and authenticated actor',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'selects only ready lifecycle decisions after the exact hash fence',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'double-checks replay around the scheduling lock and audits only ready orders',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact route, body limit, and trusted actor context',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits ready orders in dueAt/id order with exact events, receipt, revision,',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays the exact receipt and rejects divergent reuse without another revision',
                proves: [
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes identical and different-key same-version races at the location lock',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/commit-order-backlog/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back every order when a late per-order CAS loses',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/order-backlog',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.commit_order_backlog',
    },
    {
      id: 'production.commit-order-route.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'commitOrderRouteCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'commitOrderRoute',
      },
      paths: {
        cell: 'systems/production/src/cells/orders/commit-order-route/cell.ts',
        contracts: [
          'systems/production/src/cells/orders/commit-order-route/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/orders/commit-order-route/decide.ts',
          'systems/production/src/cells/orders/commit-order-route/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/orders/commit-order-route/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/orders/commit-order-route/context.postgres.ts',
          'systems/production/src/cells/orders/commit-order-route/postgres.ts',
          'systems/production/src/cells/orders/commit-order-route/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/orders/commit-order-route/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/orders/commit-order-route/http.ts',
        ],
        tests: [
          'systems/production/src/cells/orders/commit-order-route/cell.spec.ts',
          'systems/production/src/cells/orders/commit-order-route/contract.spec.ts',
          'systems/production/src/cells/orders/commit-order-route/decide.spec.ts',
          'systems/production/src/cells/orders/commit-order-route/execute.spec.ts',
          'systems/production/src/cells/orders/commit-order-route/http.spec.ts',
          'systems/production/src/cells/orders/commit-order-route/idempotency.spec.ts',
          'systems/production/src/cells/orders/commit-order-route/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/orders/commit-order-route/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes strict body then params with trusted actor and authorization',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'recomputes the locked proposal and derives every release lifecycle',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'double-checks replay around the locked graph and signals only after commit',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the deployed commit path with staged actor authorization',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects a not_found route context without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits a queued whole-order move with exact state, event receipt, revision, and post-commit signal',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays the exact durable receipt, rejects divergent reuse, and emits no duplicate revision',
                proves: [
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes identical and different-key same-version races through the ordered lock graph',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/commit-order-route/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back the route graph when an assigned attempt loses its row CAS after context loading',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:stage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.commit_order_route',
    },
    {
      id: 'production.confirm-order-overtime.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'confirmOrderOvertimeCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'confirmOrderOvertime',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/confirm-order-overtime/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/decide.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/confirm-order-overtime/cell.spec.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/contract.spec.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/decide.spec.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/execute.spec.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/http.spec.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact body, params, and override actor identity',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'recovers automatic or exact mode only from stored proposal provenance',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'commits matching automatic confirmation and signals after commit',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact staged override POST surface',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_order_execution_event_not_allowed without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_order_execution_state_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'commits each stored overtime provenance then replays and rejects divergence',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'same-payload-replay',
                  'divergent-key-conflict',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits a reachable automatic appended-new target and preserves existing membership',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_order_execution_transition_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_placement_context_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_placement_order_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_placement_stage_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes two same-queue confirmations so one places and one records queue conflict',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back placement on late event ID collision',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/confirm-order-overtime/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays only after the prior stored-proposal read and locked context',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/confirm-overtime',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.confirm_order_overtime',
    },
    {
      id: 'production.create-schedule.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'createScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'createSchedule',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/create-schedule/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/create-schedule/boundary.ts',
          'systems/production/src/cells/scheduling/create-schedule/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/create-schedule/decide.ts',
          'systems/production/src/cells/scheduling/create-schedule/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/create-schedule/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/create-schedule/postgres.ts',
          'systems/production/src/cells/scheduling/create-schedule/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/create-schedule/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/create-schedule/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/create-schedule/cell.spec.ts',
          'systems/production/src/cells/scheduling/create-schedule/contract.spec.ts',
          'systems/production/src/cells/scheduling/create-schedule/decide.spec.ts',
          'systems/production/src/cells/scheduling/create-schedule/execute.spec.ts',
          'systems/production/src/cells/scheduling/create-schedule/http.spec.ts',
          'systems/production/src/cells/scheduling/create-schedule/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes body then params plus actor',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns identity and planning/input failure precedence',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves double replay, lock order, scheduler seam, audit, commit, then signal',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares exact route and body precedence',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'stores deterministic snapshots/hashes, event and live revision',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_shift_window_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_current_plan_state_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays concurrent identical commands into one schedule and event',
                proves: [
                  'same-payload-replay',
                  'same-key-concurrency',
                  'declared-concurrency-race',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns empty selection as expected rollback',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back supersession/new schedule on late event failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects divergent reuse of a committed schedule key without another plan',
                proves: ['divergent-key-conflict'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:schedule',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/schedules',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.create_schedule',
    },
    {
      id: 'production.create-shift.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'createShiftCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'createShift',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/create-shift/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/create-shift/boundary.ts',
          'systems/production/src/cells/scheduling/create-shift/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/create-shift/decide.ts',
          'systems/production/src/cells/scheduling/create-shift/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/create-shift/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/create-shift/postgres.ts',
          'systems/production/src/cells/scheduling/create-shift/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/create-shift/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/create-shift/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/create-shift/cell.spec.ts',
          'systems/production/src/cells/scheduling/create-shift/contract.spec.ts',
          'systems/production/src/cells/scheduling/create-shift/decide.spec.ts',
          'systems/production/src/cells/scheduling/create-shift/execute.spec.ts',
          'systems/production/src/cells/scheduling/create-shift/http.spec.ts',
          'systems/production/src/cells/scheduling/create-shift/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/create-shift/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/create-shift/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes the strict deployed request plus trusted actor context',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-shift/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'builds the exact initial shift facts without allocating identity',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-shift/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'creates one shift and its exact work-event receipt atomically',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-shift/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body then params validation before actor context resolution',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits the exact shift and receipt once, replays, and rejects divergent reuse',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back the shift when its receipt cannot be appended',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/create-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical shift creation to one shift and receipt',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:schedule',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/shifts',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.create_shift',
    },
    {
      id: 'production.freeze-batch-membership.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'freezeBatchMembershipCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'freezeBatchMembership',
      },
      paths: {
        cell: 'systems/production/src/cells/floor/freeze-batch-membership/cell.ts',
        contracts: [
          'systems/production/src/cells/floor/freeze-batch-membership/boundary.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/floor/freeze-batch-membership/decide.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/floor/freeze-batch-membership/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/floor/freeze-batch-membership/postgres.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/floor/freeze-batch-membership/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/floor/freeze-batch-membership/http.ts',
        ],
        tests: [
          'systems/production/src/cells/floor/freeze-batch-membership/cell.spec.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/contract.spec.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/decide.spec.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/execute.spec.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/http.spec.ts',
          'systems/production/src/cells/floor/freeze-batch-membership/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.production-board',
            experience: 'processor',
            path: 'experiences/processor/src/features/production-board/feature.ts',
            uses: [
              'processor.load-production-board.v1',
              'production.advance-stage.v1',
              'production.assign-stage-machines.v1',
              'production.freeze-batch-membership.v1',
              'production.reconcile-batch-progress.v1',
              'production.unfreeze-batch-membership.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact command',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'allows one current queued freeze',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'double-checks replay, commits one event, then signals',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body-before-params failure precedence',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits once, signals after commit, and replays without a second signal',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version freezes and signals exactly one commit',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/freeze-batch-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns typed not-found without changing batch or queue state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects divergent freeze reuse without changing the committed batch',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'collapses concurrent identical freeze commands after the locked batch',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'rolls back batch and queue versions when the freeze event insert fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:queue',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/freeze',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.freeze_batch_membership',
    },
    {
      id: 'production.list-history-activity.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listHistoryActivityCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listHistoryActivity',
      },
      paths: {
        cell: 'systems/production/src/cells/history/list-activity/cell.ts',
        contracts: [
          'systems/production/src/cells/history/list-activity/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/history/list-activity/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/history/list-activity/postgres.ts',
        ],
        state: ['systems/production/src/cells/history/list-activity/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/history/list-activity/cell.spec.ts',
          'systems/production/src/cells/history/list-activity/contract.spec.ts',
          'systems/production/src/cells/history/list-activity/cursor.spec.ts',
          'systems/production/src/cells/history/list-activity/execute.spec.ts',
          'systems/production/src/cells/history/list-activity/postgres.int.spec.ts',
          'systems/production/src/cells/history/list-activity/project.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/history/list-activity/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'applies exact defaults and maps every normalized filter',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/history/list-activity/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves one clock-before-read value for the snapshot and result',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.list_history_activity',
    },
    {
      id: 'production.list-history-plans.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listHistoryPlansCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listHistoryPlans',
      },
      paths: {
        cell: 'systems/production/src/cells/history/list-plans/cell.ts',
        contracts: [
          'systems/production/src/cells/history/list-plans/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/history/list-plans/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/history/list-plans/postgres.ts',
        ],
        state: ['systems/production/src/cells/history/list-plans/types.ts'],
        events: [],
        protocols: ['systems/production/src/cells/history/list-plans/http.ts'],
        tests: [
          'systems/production/src/cells/history/list-plans/cell.spec.ts',
          'systems/production/src/cells/history/list-plans/contract.spec.ts',
          'systems/production/src/cells/history/list-plans/cursor.spec.ts',
          'systems/production/src/cells/history/list-plans/execute.spec.ts',
          'systems/production/src/cells/history/list-plans/http.spec.ts',
          'systems/production/src/cells/history/list-plans/postgres.int.spec.ts',
          'systems/production/src/cells/history/list-plans/project.spec.ts',
        ],
        features: [
          {
            id: 'processor.history',
            experience: 'processor',
            path: 'experiences/processor/src/features/history/feature.ts',
            uses: [
              'processor.list-production-history-activity.v1',
              'processor.load-production-history-run.v1',
              'production.list-history-plans.v1',
              'production.list-history-runs.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/history/list-plans/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'applies current query defaults and converts the temporal filter once',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/history/list-plans/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'uses one clock value for the repository snapshot and wire asOf',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/history/list-plans/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact GET route with no body parser limit',
                proves: ['protocol'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/history/plans',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.list_history_plans',
    },
    {
      id: 'production.list-history-runs.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listHistoryRunsCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listHistoryRuns',
      },
      paths: {
        cell: 'systems/production/src/cells/history/list-runs/cell.ts',
        contracts: [
          'systems/production/src/cells/history/list-runs/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/history/list-runs/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/history/list-runs/postgres.ts',
        ],
        state: ['systems/production/src/cells/history/list-runs/types.ts'],
        events: [],
        protocols: ['systems/production/src/cells/history/list-runs/http.ts'],
        tests: [
          'systems/production/src/cells/history/list-runs/cell.spec.ts',
          'systems/production/src/cells/history/list-runs/contract.spec.ts',
          'systems/production/src/cells/history/list-runs/cursor.spec.ts',
          'systems/production/src/cells/history/list-runs/execute.spec.ts',
          'systems/production/src/cells/history/list-runs/http.spec.ts',
          'systems/production/src/cells/history/list-runs/postgres.int.spec.ts',
          'systems/production/src/cells/history/list-runs/project.spec.ts',
        ],
        features: [
          {
            id: 'processor.history',
            experience: 'processor',
            path: 'experiences/processor/src/features/history/feature.ts',
            uses: [
              'processor.list-production-history-activity.v1',
              'processor.load-production-history-run.v1',
              'production.list-history-plans.v1',
              'production.list-history-runs.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/history/history-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/history/list-runs/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'applies the page default and maps inclusive createdAfter inward',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/history/list-runs/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'passes one clock instant into the repository snapshot',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/history/list-runs/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves the route and validates query before params',
                proves: ['protocol'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/history/runs',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.list_history_runs',
    },
    {
      id: 'production.list-locations.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listLocationsCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listLocations',
      },
      paths: {
        cell: 'systems/production/src/cells/resources/list-locations/cell.ts',
        contracts: [
          'systems/production/src/cells/resources/list-locations/boundary.ts',
          'systems/production/src/cells/resources/list-locations/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/resources/list-locations/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/resources/list-locations/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/resources/list-locations/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/resources/list-locations/http.ts',
        ],
        tests: [
          'systems/production/src/cells/resources/list-locations/cell.spec.ts',
          'systems/production/src/cells/resources/list-locations/contract.spec.ts',
          'systems/production/src/cells/resources/list-locations/execute.spec.ts',
          'systems/production/src/cells/resources/list-locations/http.spec.ts',
          'systems/production/src/cells/resources/list-locations/postgres.int.spec.ts',
          'systems/production/src/cells/resources/list-locations/project.spec.ts',
        ],
        features: [
          {
            id: 'processor.location-selection',
            experience: 'processor',
            path: 'experiences/processor/src/features/location-selection/feature.ts',
            uses: ['production.list-locations.v1'],
            stateProofs: [
              'experiences/processor/src/features/location-selection/location-selection.view.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/location-selection/location-selection.view.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/resources/list-locations/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves boolean coercion, the default, and authorization-derived scope',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/list-locations/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'observes asOf after the repository list completes',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/list-locations/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'keeps the exact route and reads location scope only after query validation',
                proves: ['protocol'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations',
          contextRequirements: ['allowed-production-location-ids'],
          boundaryProfile:
            'api-processor-production-bodyless-allowed-locations-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.list_locations',
    },
    {
      id: 'production.list-order-control.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listOrderControlCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listOrderControl',
      },
      paths: {
        cell: 'systems/production/src/cells/orders/list-order-control/cell.ts',
        contracts: [
          'systems/production/src/cells/orders/list-order-control/boundary.ts',
          'systems/production/src/cells/orders/list-order-control/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/orders/list-order-control/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/orders/list-order-control/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/orders/list-order-control/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/orders/list-order-control/capabilities.spec.ts',
          'systems/production/src/cells/orders/list-order-control/cell.spec.ts',
          'systems/production/src/cells/orders/list-order-control/contract.spec.ts',
          'systems/production/src/cells/orders/list-order-control/cursor.spec.ts',
          'systems/production/src/cells/orders/list-order-control/due.spec.ts',
          'systems/production/src/cells/orders/list-order-control/execute.spec.ts',
          'systems/production/src/cells/orders/list-order-control/postgres.int.spec.ts',
          'systems/production/src/cells/orders/list-order-control/project.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/orders/list-order-control/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves defaults, trimming, boolean strings, and bounded limit coercion',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/list-order-control/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reads one clock before the repository and serializes asOf',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.list_order_control',
    },
    {
      id: 'production.list-orders.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'listOrdersCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'listOrders',
      },
      paths: {
        cell: 'systems/production/src/cells/orders/list-orders/cell.ts',
        contracts: [
          'systems/production/src/cells/orders/list-orders/boundary.ts',
          'systems/production/src/cells/orders/list-orders/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/orders/list-orders/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/orders/list-orders/postgres.ts',
        ],
        state: ['systems/production/src/cells/orders/list-orders/types.ts'],
        events: [],
        protocols: ['systems/production/src/cells/orders/list-orders/http.ts'],
        tests: [
          'systems/production/src/cells/orders/list-orders/cell.spec.ts',
          'systems/production/src/cells/orders/list-orders/contract.spec.ts',
          'systems/production/src/cells/orders/list-orders/cursor.spec.ts',
          'systems/production/src/cells/orders/list-orders/execute.spec.ts',
          'systems/production/src/cells/orders/list-orders/http.spec.ts',
          'systems/production/src/cells/orders/list-orders/postgres.int.spec.ts',
          'systems/production/src/cells/orders/list-orders/project.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/orders/list-orders/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'applies defaults and maps validated timestamps inward',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/list-orders/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'passes one clock instant through repository and response',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/list-orders/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves route and validates query before params',
                proves: ['protocol'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/orders',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.list_orders',
    },
    {
      id: 'production.load-board.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadBoardCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadBoard',
      },
      paths: {
        cell: 'systems/production/src/cells/queries/load-board/cell.ts',
        contracts: [
          'systems/production/src/cells/queries/load-board/boundary.ts',
          'systems/production/src/cells/queries/load-board/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/queries/load-board/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/queries/load-board/postgres.ts',
        ],
        state: ['systems/production/src/cells/queries/load-board/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/queries/load-board/cell.spec.ts',
          'systems/production/src/cells/queries/load-board/contract.spec.ts',
          'systems/production/src/cells/queries/load-board/execute.spec.ts',
          'systems/production/src/cells/queries/load-board/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/queries/load-board/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes and encodes the strict location/run identity',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/queries/load-board/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'observes one clock value before the repository read and serializes it',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.load_board',
    },
    {
      id: 'production.load-history-run.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadHistoryRunCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadHistoryRun',
      },
      paths: {
        cell: 'systems/production/src/cells/history/load-run/cell.ts',
        contracts: [
          'systems/production/src/cells/history/load-run/contract.ts',
        ],
        decisions: [],
        executors: ['systems/production/src/cells/history/load-run/execute.ts'],
        persistence: [
          'systems/production/src/cells/history/load-run/postgres.ts',
        ],
        state: ['systems/production/src/cells/history/load-run/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/history/load-run/cell.spec.ts',
          'systems/production/src/cells/history/load-run/contract.spec.ts',
          'systems/production/src/cells/history/load-run/execute.spec.ts',
          'systems/production/src/cells/history/load-run/postgres.int.spec.ts',
          'systems/production/src/cells/history/load-run/project.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/history/load-run/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'accepts only strict location and run identity',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/history/load-run/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reads the clock once before opening the repository snapshot',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.load_history_run',
    },
    {
      id: 'production.load-remaining-day-forecast.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadRemainingDayForecastCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadRemainingDayForecast',
      },
      paths: {
        cell: 'systems/production/src/cells/queries/load-remaining-day-forecast/cell.ts',
        contracts: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/boundary.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/queries/load-remaining-day-forecast/cell.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/contract.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/execute.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/placement.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/postgres.int.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/project.spec.ts',
          'systems/production/src/cells/queries/load-remaining-day-forecast/window.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/queries/load-remaining-day-forecast/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'accepts only strict location params and one real service-day query',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/queries/load-remaining-day-forecast/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reads one clock before the repeatable-read repository and carries it to output',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.load_remaining_day_forecast',
    },
    {
      id: 'production.load-schedule.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadSchedule',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/load-schedule/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/load-schedule/boundary.ts',
          'systems/production/src/cells/scheduling/load-schedule/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/scheduling/load-schedule/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/load-schedule/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/load-schedule/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/load-schedule/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/load-schedule/load-schedule.spec.ts',
          'systems/production/src/cells/scheduling/load-schedule/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/load-schedule/load-schedule.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips strict route identity, canonical proposal copies, and failure',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/load-schedule/load-schedule.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares GET and validates params before after-input authorization',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/load-schedule/load-schedule.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns the repository proposal or the exact typed not-found failure',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/schedules/:scheduleRunId',
          contextRequirements: [],
          boundaryProfile: 'api-processor-production-bodyless-resource-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.load_schedule',
    },
    {
      id: 'production.load-workspace.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'loadWorkspaceCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'loadWorkspace',
      },
      paths: {
        cell: 'systems/production/src/cells/queries/load-workspace/cell.ts',
        contracts: [
          'systems/production/src/cells/queries/load-workspace/boundary.ts',
          'systems/production/src/cells/queries/load-workspace/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/queries/load-workspace/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/queries/load-workspace/placement.postgres.ts',
          'systems/production/src/cells/queries/load-workspace/postgres.ts',
        ],
        state: ['systems/production/src/cells/queries/load-workspace/types.ts'],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/queries/load-workspace/cell.spec.ts',
          'systems/production/src/cells/queries/load-workspace/contract.spec.ts',
          'systems/production/src/cells/queries/load-workspace/demand.spec.ts',
          'systems/production/src/cells/queries/load-workspace/execute.spec.ts',
          'systems/production/src/cells/queries/load-workspace/live.spec.ts',
          'systems/production/src/cells/queries/load-workspace/postgres.int.spec.ts',
          'systems/production/src/cells/queries/load-workspace/selection.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/queries/load-workspace/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'uses only optional query shiftId despite tolerant path params',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/queries/load-workspace/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reads one clock value before the repository and preserves unordered workspace arrays',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.load_workspace',
    },
    {
      id: 'production.manage-resources.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'manageResourcesCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'manageResources',
      },
      paths: {
        cell: 'systems/production/src/cells/resources/manage-resources/cell.ts',
        contracts: [
          'systems/production/src/cells/resources/manage-resources/boundary.ts',
          'systems/production/src/cells/resources/manage-resources/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/resources/manage-resources/decide.ts',
          'systems/production/src/cells/resources/manage-resources/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/resources/manage-resources/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/resources/manage-resources/postgres.ts',
          'systems/production/src/cells/resources/manage-resources/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/resources/manage-resources/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/resources/manage-resources/cell.spec.ts',
          'systems/production/src/cells/resources/manage-resources/contract.spec.ts',
          'systems/production/src/cells/resources/manage-resources/decide.spec.ts',
          'systems/production/src/cells/resources/manage-resources/execute.spec.ts',
          'systems/production/src/cells/resources/manage-resources/idempotency.spec.ts',
          'systems/production/src/cells/resources/manage-resources/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/resources/manage-resources/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the strict CLI-derived command',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'sorts changed fields and reports exact no-op counts',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'checks replay before loading and applies one converged command exactly',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'applies exact rows, IDs, event, receipt and revision then replays',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns ordered destructive rejections with no apply-side mutation',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'waits for the shared location scheduling lock before changing resources or config',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical applies after the location lock',
                proves: ['same-key-concurrency'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/resources/manage-resources/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back all resource writes and revision after a late event collision',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'production.manage_resources',
    },
    {
      id: 'production.place-order-automatically.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'placeOrderAutomaticallyCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'placeOrderAutomatically',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/place-order-automatically/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/place-order-automatically/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/place-order-automatically/decide.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/place-order-automatically/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/place-order-automatically/postgres.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/place-order-automatically/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/place-order-automatically/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/place-order-automatically/cell.spec.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/contract.spec.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/decide.spec.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/execute.spec.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/http.spec.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips exact body and params while deriving override authority',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'commits the target model execution transition',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'commits an automatic existing-batch proposal audits then signals',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact staged POST surface',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_order_execution_event_not_allowed without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_order_execution_state_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'commits the complete existing-batch graph, audits once, replays, and rejects divergence',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes two distinct same-queue orders so one places and one records queue conflict',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_order_execution_transition_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_placement_queue_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_placement_stage_version_conflict without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back the complete graph on late work-event ID failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-automatically/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays a same-key contender only after its locked context becomes available',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/place',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.place_order_automatically',
    },
    {
      id: 'production.place-order-exactly.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'placeOrderExactlyCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'placeOrderExactly',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/place-order-exactly/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/place-order-exactly/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/place-order-exactly/decide.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/place-order-exactly/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/place-order-exactly/context.postgres.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/postgres.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/place-order-exactly/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/place-order-exactly/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/place-order-exactly/cell.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/context.postgres.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/contract.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/decide.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/execute.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/http.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/place-order-exactly/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes strict body, route identity, actor, and fixed authorization',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'binds exact target input and returns the canonical commit plan',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'checks replay before and after the locked context inside one UoW, then signals after commit',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares only the exact deployed POST with staged actor context',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one exact existing-target placement with complete state, receipt, revision, and post-commit signal',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'replays exact receipt and rejects divergent target version without duplicate state',
                proves: [
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes identical and different-key same-version races at the run lock',
                proves: ['same-key-concurrency', 'declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/place-order-exactly/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back placement mutations and receipt revision when event append fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/orders/:productionOrderId/place',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.place_order_exactly',
    },
    {
      id: 'production.preview-order-backlog.v1',
      kind: 'query',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'previewOrderBacklogCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'previewOrderBacklog',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/preview-order-backlog/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/preview-order-backlog/boundary.ts',
          'systems/production/src/cells/demand/preview-order-backlog/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/demand/preview-order-backlog/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/preview-order-backlog/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/preview-order-backlog/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/demand/preview-order-backlog/cell.spec.ts',
          'systems/production/src/cells/demand/preview-order-backlog/contract.spec.ts',
          'systems/production/src/cells/demand/preview-order-backlog/execute.spec.ts',
          'systems/production/src/cells/demand/preview-order-backlog/postgres.int.spec.ts',
          'systems/production/src/cells/demand/preview-order-backlog/project.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/preview-order-backlog/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'combines strict route params and body while applying exact defaults',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/preview-order-backlog/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'reads and classifies the snapshot before its one clock observation',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.preview_order_backlog',
    },
    {
      id: 'production.preview-order-route.v1',
      kind: 'query',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'previewOrderRouteCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'previewOrderRoute',
      },
      paths: {
        cell: 'systems/production/src/cells/orders/preview-order-route/cell.ts',
        contracts: [
          'systems/production/src/cells/orders/preview-order-route/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/orders/preview-order-route/decide.ts',
        ],
        executors: [
          'systems/production/src/cells/orders/preview-order-route/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/orders/preview-order-route/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/orders/preview-order-route/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/orders/preview-order-route/http.ts',
        ],
        tests: [
          'systems/production/src/cells/orders/preview-order-route/cell.spec.ts',
          'systems/production/src/cells/orders/preview-order-route/contract.spec.ts',
          'systems/production/src/cells/orders/preview-order-route/execute.spec.ts',
          'systems/production/src/cells/orders/preview-order-route/http.spec.ts',
          'systems/production/src/cells/orders/preview-order-route/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.order-control',
            experience: 'processor',
            path: 'experiences/processor/src/features/order-control/feature.ts',
            uses: [
              'orders.accept-incoming-order-proposal.v1',
              'orders.list-incoming-order-proposals.v1',
              'orders.reject-incoming-order-proposal.v1',
              'orders.restore-incoming-order-proposal.v1',
              'processor.list-production-order-control.v1',
              'production.commit-order-route.v1',
              'production.list-orders.v1',
              'production.preview-order-route.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/order-control/incoming-orders.test.tsx',
              'experiences/processor/src/features/order-control/order-control-workspace.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/orders/preview-order-route/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes the strict queued-move request with its trusted route identity',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/preview-order-route/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'loads one snapshot, proposes without a write capability, and signals success',
                proves: ['decision', 'executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/orders/preview-order-route/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares only the deployed preview transport and actor context',
                proves: ['protocol'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:stage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/orders/:productionOrderId/route/preview',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.preview_order_route',
    },
    {
      id: 'production.publish-scheduler-config.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'publishSchedulerConfigCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'publishSchedulerConfig',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/publish-scheduler-config/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/boundary.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/decide.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/publish-scheduler-config/cell.spec.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/contract.spec.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/decide.spec.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/execute.spec.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/http.spec.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.settings',
            experience: 'processor',
            path: 'experiences/processor/src/features/settings/feature.ts',
            uses: ['production.publish-scheduler-config.v1'],
            stateProofs: [
              'experiences/processor/src/features/settings/scheduler-config-publication.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/settings/scheduler-config-publication.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes and re-encodes the strict deployed request plus actor context',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the stable operation identity and fixed current algorithm',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'checks replay before versioning, then commits the config and exact receipt',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body then params validation before actor context resolution',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits each monotonic version and receipt once, advances live revision, replays, and rejects divergence',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects scheduler_config_invalid before persistence without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes concurrent config publications into monotonic versions',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back the config and live-revision increment when receipt append fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/publish-scheduler-config/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical config publication to one version',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:schedule',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/scheduler-configs',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.publish_scheduler_config',
    },
    {
      id: 'production.reconcile-batch-progress.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'reconcileBatchProgressCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'reconcileBatchProgress',
      },
      paths: {
        cell: 'systems/production/src/cells/floor/reconcile-batch-progress/cell.ts',
        contracts: [
          'systems/production/src/cells/floor/reconcile-batch-progress/boundary.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/floor/reconcile-batch-progress/confirmation.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/decide.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/floor/reconcile-batch-progress/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/floor/reconcile-batch-progress/attempts.postgres.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/postgres.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/terminal.postgres.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/floor/reconcile-batch-progress/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/floor/reconcile-batch-progress/http.ts',
        ],
        tests: [
          'systems/production/src/cells/floor/reconcile-batch-progress/cell.spec.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/contract.spec.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/decide.spec.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/execute.spec.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/http.spec.ts',
          'systems/production/src/cells/floor/reconcile-batch-progress/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.production-board',
            experience: 'processor',
            path: 'experiences/processor/src/features/production-board/feature.ts',
            uses: [
              'processor.load-production-board.v1',
              'production.advance-stage.v1',
              'production.assign-stage-machines.v1',
              'production.freeze-batch-membership.v1',
              'production.reconcile-batch-progress.v1',
              'production.unfreeze-batch-membership.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact four-stage command and null optionals',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'returns a deterministic confirmation preview then exact commit plan',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'previews without mutation or a durable receipt',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body-before-params failure precedence',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'previews without mutation, commits once, signals, and replays',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes confirmed same-version progress so one signal commits',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/reconcile-batch-progress/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns typed not-found without changing the execution graph',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'returns typed conflict without changing the execution graph',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects divergent confirmed progress reuse without changing the milestone',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'collapses concurrent identical confirmed progress after context locking',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'rolls back the reconciled stages when the late event insert fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:stage',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/progress-reconciliation',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.reconcile_batch_progress',
    },
    {
      id: 'production.record-order-intake.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'recordOrderIntakeCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'recordOrderIntake',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/record-order-intake/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/record-order-intake/boundary.ts',
          'systems/production/src/cells/demand/record-order-intake/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/record-order-intake/decide.ts',
          'systems/production/src/cells/demand/record-order-intake/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/record-order-intake/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/record-order-intake/postgres.ts',
          'systems/production/src/cells/demand/record-order-intake/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/record-order-intake/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/demand/record-order-intake/http.ts',
        ],
        tests: [
          'systems/production/src/cells/demand/record-order-intake/cell.spec.ts',
          'systems/production/src/cells/demand/record-order-intake/contract.spec.ts',
          'systems/production/src/cells/demand/record-order-intake/decide.spec.ts',
          'systems/production/src/cells/demand/record-order-intake/execute.spec.ts',
          'systems/production/src/cells/demand/record-order-intake/http.spec.ts',
          'systems/production/src/cells/demand/record-order-intake/idempotency.spec.ts',
          'systems/production/src/cells/demand/record-order-intake/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.intake',
            experience: 'processor',
            path: 'experiences/processor/src/features/intake/feature.ts',
            uses: [
              'processor.list-production-order-control.v1',
              'production.change-admission.v1',
              'production.record-order-intake.v1',
              'production.set-order-priority.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/record-order-intake/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact deployed request and trusted actor',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'derives an eligible state from released positive demand and intake',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves replay, lock, CAS, bag mutation, and audit order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact route, limit, and authenticated actor context',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits exact bags and receipt once, replays, and rejects divergent reuse',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version intake writes so one mutation wins',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back order, bags, receipt, and live revision after late append failure',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/record-order-intake/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical intake commands to one bag graph',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:intake',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PUT',
          path: '/production/locations/:locationId/orders/:productionOrderId/intake',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.record_order_intake',
    },
    {
      id: 'production.replace-shift-selection.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'replaceShiftSelectionCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'replaceShiftSelection',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/replace-shift-selection/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/replace-shift-selection/boundary.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/replace-shift-selection/decide.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/replace-shift-selection/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/replace-shift-selection/postgres.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/replace-shift-selection/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/replace-shift-selection/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/replace-shift-selection/cell.spec.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/contract.spec.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/decide.spec.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/execute.spec.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/http.spec.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/replace-shift-selection/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes and re-encodes the strict request as sorted unique input',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the stable operation identity and canonical sorted unique input',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves double replay, lock, decision, mutation, receipt, commit, then signal order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'stages validated location authorization after exact body-then-params validation',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'creates version one with ordered rows and one exact replayable receipt',
                proves: [
                  'postgres-commit',
                  'same-payload-replay',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'uses the after-lock replay to collapse a concurrent identical command and signal once',
                proves: ['same-key-concurrency'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes different-key same-version races so one command conflicts without a receipt',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/replace-shift-selection/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back selection and plan when the late work-event receipt fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:schedule',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PUT',
          path: '/production/locations/:locationId/shifts/:productionShiftId/selection',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.replace_shift_selection',
    },
    {
      id: 'production.resolve-source-closed-fulfillment.v1',
      kind: 'command',
      authentication: 'none',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'resolveSourceClosedFulfillmentCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'resolveSourceClosedFulfillment',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/resolve-source-closed-fulfillment/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/decide.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/types.ts',
        ],
        events: [],
        protocols: [],
        tests: [
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/cell.spec.ts',
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/contract.spec.ts',
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/decide.spec.ts',
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/execute.spec.ts',
          'systems/production/src/cells/demand/resolve-source-closed-fulfillment/postgres.int.spec.ts',
        ],
        features: [],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/resolve-source-closed-fulfillment/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the complete source-neutral command',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/resolve-source-closed-fulfillment/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'delegates only open, unreleased, unresolved canonical work',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/resolve-source-closed-fulfillment/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'delegates the exact authoritative resolution command and maps success',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/resolve-source-closed-fulfillment/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits delegated resolution and returns the same durable replay',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
              {
                name: 'rejects divergent delegated identity without another Production write',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'collapses concurrent identical source-close resolution through the delegated receipt',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'leaves PostgreSQL untouched when candidate loading fails before delegation',
                proves: ['unexpected-failure-no-write'],
              },
            ],
          },
        ],
      },
      authorization: null,
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: true,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: [],
      observability: 'production.resolve_source_closed_fulfillment',
    },
    {
      id: 'production.set-order-priority.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'setOrderPriorityCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'setOrderPriority',
      },
      paths: {
        cell: 'systems/production/src/cells/demand/set-order-priority/cell.ts',
        contracts: [
          'systems/production/src/cells/demand/set-order-priority/boundary.ts',
          'systems/production/src/cells/demand/set-order-priority/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/demand/set-order-priority/decide.ts',
          'systems/production/src/cells/demand/set-order-priority/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/demand/set-order-priority/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/demand/set-order-priority/postgres.ts',
          'systems/production/src/cells/demand/set-order-priority/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/demand/set-order-priority/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/demand/set-order-priority/http.ts',
        ],
        tests: [
          'systems/production/src/cells/demand/set-order-priority/cell.spec.ts',
          'systems/production/src/cells/demand/set-order-priority/contract.spec.ts',
          'systems/production/src/cells/demand/set-order-priority/decide.spec.ts',
          'systems/production/src/cells/demand/set-order-priority/execute.spec.ts',
          'systems/production/src/cells/demand/set-order-priority/http.spec.ts',
          'systems/production/src/cells/demand/set-order-priority/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.intake',
            experience: 'processor',
            path: 'experiences/processor/src/features/intake/feature.ts',
            uses: [
              'processor.list-production-order-control.v1',
              'production.change-admission.v1',
              'production.record-order-intake.v1',
              'production.set-order-priority.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/intake/intake.test.tsx',
            ],
          },
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/demand/set-order-priority/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes the deployed strict request and trusted actor scope',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'commits an active order at the exact expected version',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves the required lock, mutation, and audit order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'rejects an invalid body before invalid params and authorization',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits once, advances the live revision, and replays the receipt',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version writes so exactly one command commits',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back the order update when the work-event append fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/demand/set-order-priority/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects divergent priority reuse without another order mutation',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'collapses concurrent identical priority commands after the location lock',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:priority',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PATCH',
          path: '/production/locations/:locationId/orders/:productionOrderId/priority',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.set_order_priority',
    },
    {
      id: 'production.start-schedule.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'startScheduleCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'startSchedule',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/start-schedule/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/start-schedule/boundary.ts',
          'systems/production/src/cells/scheduling/start-schedule/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/start-schedule/decide.ts',
          'systems/production/src/cells/scheduling/start-schedule/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/start-schedule/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/start-schedule/postgres.ts',
          'systems/production/src/cells/scheduling/start-schedule/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/start-schedule/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/start-schedule/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/start-schedule/cell.spec.ts',
          'systems/production/src/cells/scheduling/start-schedule/contract.spec.ts',
          'systems/production/src/cells/scheduling/start-schedule/decide.spec.ts',
          'systems/production/src/cells/scheduling/start-schedule/execute.spec.ts',
          'systems/production/src/cells/scheduling/start-schedule/http.spec.ts',
          'systems/production/src/cells/scheduling/start-schedule/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'decodes the exact body, params and authenticated actor',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'distinguishes missing schedule, hash drift, and a ready record',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'preserves lock, clock, graph/event commit, and after-commit signal order',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves the route, authentication context, and body-params-auth order',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_order_execution_event_not_allowed without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_run_already_exists without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects production_shift_not_found without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_has_no_batches without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_not_accepted without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'materializes the complete deterministic graph and receipt atomically',
                proves: ['postgres-commit'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes concurrent identical starts, replays exactly, and rejects divergent reuse',
                proves: [
                  'same-payload-replay',
                  'same-key-concurrency',
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'resolves same-key divergence and different-key races after both first replay misses',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rejects production_shift_window_invalid without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects schedule_not_current without partial durable state',
                proves: ['expected-rejection-no-partial-write'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/start-schedule/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back graph and order state on a late receipt ID collision',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:start',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'partitioned',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/schedules/:scheduleRunId/start',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.start_schedule',
    },
    {
      id: 'production.subscribe-changes.v1',
      kind: 'subscription',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'subscribeProductionChangesCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'subscribeChanges',
      },
      paths: {
        cell: 'systems/production/src/cells/live/subscribe-changes/cell.ts',
        contracts: [
          'systems/production/src/cells/live/subscribe-changes/contract.ts',
        ],
        decisions: [],
        executors: [
          'systems/production/src/cells/live/subscribe-changes/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/live/subscribe-changes/postgres.ts',
        ],
        state: ['systems/production/src/cells/live/subscribe-changes/types.ts'],
        events: [],
        protocols: [
          'systems/production/src/cells/live/subscribe-changes/http.ts',
        ],
        tests: [
          'systems/production/src/cells/live/subscribe-changes/cell.spec.ts',
          'systems/production/src/cells/live/subscribe-changes/contract.spec.ts',
          'systems/production/src/cells/live/subscribe-changes/execute.spec.ts',
          'systems/production/src/cells/live/subscribe-changes/postgres.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/live/subscribe-changes/cell.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'builds an executable stream catalog without entering the finite HTTP catalog',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/live/subscribe-changes/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the versioned input and initial revision',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/live/subscribe-changes/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'subscribes before reading the revision and closes the initial race',
                proves: ['executor-success'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:read',
        timing: 'before-input',
      },
      consistency: {
        transaction: 'none',
        concurrency: 'none',
        idempotencyRequired: false,
      },
      cli: [],
      http: [],
      jobs: [],
      eventStreams: [
        {
          method: 'GET',
          path: '/production/locations/:locationId/events',
          retryMs: 3000,
          eventTypes: ['ready', 'change', 'resync'],
        },
      ],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.subscribe_changes',
    },
    {
      id: 'production.unfreeze-batch-membership.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'unfreezeBatchMembershipCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'unfreezeBatchMembership',
      },
      paths: {
        cell: 'systems/production/src/cells/floor/unfreeze-batch-membership/cell.ts',
        contracts: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/boundary.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/decide.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/postgres.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/http.ts',
        ],
        tests: [
          'systems/production/src/cells/floor/unfreeze-batch-membership/cell.spec.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/contract.spec.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/decide.spec.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/execute.spec.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/http.spec.ts',
          'systems/production/src/cells/floor/unfreeze-batch-membership/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.production-board',
            experience: 'processor',
            path: 'experiences/processor/src/features/production-board/feature.ts',
            uses: [
              'processor.load-production-board.v1',
              'production.advance-stage.v1',
              'production.assign-stage-machines.v1',
              'production.freeze-batch-membership.v1',
              'production.reconcile-batch-progress.v1',
              'production.unfreeze-batch-membership.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/production-board/production-board.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the exact command',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'allows a current frozen queued batch',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'double-checks replay and commits one audited mutation',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'preserves body-before-params failure precedence',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'commits one mutable projection, advances revision, and replays',
                proves: ['postgres-commit', 'same-payload-replay'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version unfreezes so one work event commits',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/floor/unfreeze-batch-membership/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'returns typed not-found without changing batch or queue state',
                proves: ['expected-rejection-no-partial-write'],
              },
              {
                name: 'rejects divergent unfreeze reuse without changing the mutable result',
                proves: [
                  'divergent-key-conflict',
                  'expected-rejection-no-partial-write',
                ],
              },
              {
                name: 'collapses concurrent identical unfreeze commands after the locked batch',
                proves: ['same-key-concurrency'],
              },
              {
                name: 'rolls back batch and queue versions when the unfreeze event insert fails',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:override',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'POST',
          path: '/production/locations/:locationId/runs/:productionRunId/batches/:productionBatchId/unfreeze',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.unfreeze_batch_membership',
    },
    {
      id: 'production.update-shift.v1',
      kind: 'command',
      authentication: 'required',
      owner: 'production',
      ownerKind: 'system',
      source: {
        moduleSpecifier: '@pressly/production-system',
        manifestExportName: 'updateShiftCellDeclaration',
        assemblyExportName: 'makeProductionSystem',
        assemblyKey: 'updateShift',
      },
      paths: {
        cell: 'systems/production/src/cells/scheduling/update-shift/cell.ts',
        contracts: [
          'systems/production/src/cells/scheduling/update-shift/boundary.ts',
          'systems/production/src/cells/scheduling/update-shift/contract.ts',
        ],
        decisions: [
          'systems/production/src/cells/scheduling/update-shift/decide.ts',
          'systems/production/src/cells/scheduling/update-shift/idempotency.ts',
        ],
        executors: [
          'systems/production/src/cells/scheduling/update-shift/execute.ts',
        ],
        persistence: [
          'systems/production/src/cells/scheduling/update-shift/postgres.ts',
          'systems/production/src/cells/scheduling/update-shift/work-event.postgres.ts',
        ],
        state: [
          'systems/production/src/cells/scheduling/update-shift/types.ts',
        ],
        events: [],
        protocols: [
          'systems/production/src/cells/scheduling/update-shift/http.ts',
        ],
        tests: [
          'systems/production/src/cells/scheduling/update-shift/cell.spec.ts',
          'systems/production/src/cells/scheduling/update-shift/contract.spec.ts',
          'systems/production/src/cells/scheduling/update-shift/decide.spec.ts',
          'systems/production/src/cells/scheduling/update-shift/execute.spec.ts',
          'systems/production/src/cells/scheduling/update-shift/http.spec.ts',
          'systems/production/src/cells/scheduling/update-shift/idempotency.spec.ts',
          'systems/production/src/cells/scheduling/update-shift/postgres.int.spec.ts',
        ],
        features: [
          {
            id: 'processor.scheduling',
            experience: 'processor',
            path: 'experiences/processor/src/features/scheduling/feature.ts',
            uses: [
              'processor.load-production-workspace.v1',
              'production.accept-schedule.v1',
              'production.confirm-order-overtime.v1',
              'production.create-schedule.v1',
              'production.create-shift.v1',
              'production.load-schedule.v1',
              'production.place-order-automatically.v1',
              'production.place-order-exactly.v1',
              'production.replace-shift-selection.v1',
              'production.set-order-priority.v1',
              'production.start-schedule.v1',
              'production.subscribe-changes.v1',
              'production.update-shift.v1',
            ],
            stateProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
            componentProofs: [
              'experiences/processor/src/features/scheduling/scheduling.test.tsx',
              'experiences/processor/src/features/scheduling/live-run-changes.test.tsx',
            ],
          },
        ],
        proofs: [
          {
            path: 'systems/production/src/cells/scheduling/update-shift/contract.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'round-trips the deployed body, params, and trusted actor context',
                proves: ['contract'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/decide.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'owns the stable operation identity and exact window rule',
                proves: ['decision'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/execute.spec.ts',
            layer: 'unit',
            scenarios: [
              {
                name: 'double-checks replay preserves lock order audits commits then signals',
                proves: ['executor-success'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/http.spec.ts',
            layer: 'contract',
            scenarios: [
              {
                name: 'declares the exact PATCH surface and actor requirement',
                proves: ['protocol'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'updates accepted or draft plans once then replays and rejects divergence',
                proves: [
                  'postgres-commit',
                  'expected-rejection-no-partial-write',
                  'same-payload-replay',
                  'divergent-key-conflict',
                ],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'serializes same-version edits so exactly one commits',
                proves: ['declared-concurrency-race'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'rolls back shift and plan when the work-event append fails late',
                proves: ['unexpected-failure-rollback'],
              },
            ],
          },
          {
            path: 'systems/production/src/cells/scheduling/update-shift/postgres.int.spec.ts',
            layer: 'postgres',
            scenarios: [
              {
                name: 'collapses concurrent identical shift edits after the location lock',
                proves: ['same-key-concurrency'],
              },
            ],
          },
        ],
      },
      authorization: {
        capability: 'production:schedule',
        timing: 'after-input',
      },
      consistency: {
        transaction: 'required',
        concurrency: 'optimistic',
        idempotencyRequired: true,
      },
      cli: [],
      http: [
        {
          method: 'PATCH',
          path: '/production/locations/:locationId/shifts/:productionShiftId',
          contextRequirements: ['authenticated-actor'],
          boundaryProfile:
            'api-processor-production-actor-command-after-input-v1',
        },
      ],
      jobs: [],
      eventStreams: [],
      emits: [],
      consumes: [],
      experienceConsumers: ['processor'],
      observability: 'production.update_shift',
    },
  ],
} as const);
