import {
  accessCellDeclarations,
  type AccessOperationId,
} from '@pressly/access-system';
import {
  createCustomerCellDeclaration,
  getCustomerCellDeclaration,
  listCustomersCellDeclaration,
  resolveExactSourceCustomerCellDeclaration,
  updateCustomerCellDeclaration,
} from '@pressly/customers-system';
import {
  adminCliCellDeclarations,
  controlAuthenticationFeature,
  controlCellDeclarations,
  controlConfigurationFeature,
  controlCustomersFeature,
  controlOrdersFeature,
  controlSecurityFeature,
  controlTeamFeature,
} from '@pressly/experience-control';
import {
  customerAuthCellDeclarations,
  customerOrderEntryFeature,
  customerPricingFeature,
} from '@pressly/experience-customer';
import {
  processorAuthenticationFeature,
  processorForecastFeature,
  processorHistoryFeature,
  processorIntakeFeature,
  processorLocationSelectionFeature,
  processorOrderControlFeature,
  processorOrderResolutionFeature,
  processorProductionBoardFeature,
  processorSchedulingFeature,
  processorSettingsFeature,
} from '@pressly/experience-processor';
import { processorCellDeclarations } from '@pressly/experience-processor/server';
import {
  loadPricingCatalogCellDeclaration,
  planPricingChangeCellDeclaration,
  publishPricingChangeCellDeclaration,
} from '@pressly/pricing-system';
import {
  defineExperience,
  defineSystem,
  selectCell,
  selectExperienceFeature,
  type CellSelection,
  type StaticCellManifest,
} from './src/public.ts';

type SourceNames<Declarations extends Readonly<Record<string, unknown>>> = {
  readonly [Key in keyof Declarations]: string;
};

const selectDeclarationMap = <
  const Declarations extends Readonly<Record<string, StaticCellManifest>>,
>(input: {
  declarations: Declarations;
  manifestExportNames: SourceNames<Declarations>;
  moduleSpecifier: string;
  assemblyExportName: string;
}): readonly CellSelection[] =>
  Object.entries(input.declarations).map(([assemblyKey, manifest]) =>
    selectCell({
      manifest,
      source: {
        moduleSpecifier: input.moduleSpecifier,
        manifestExportName: Reflect.get(
          input.manifestExportNames,
          assemblyKey,
        ) as string,
        assemblyExportName: input.assemblyExportName,
        assemblyKey,
      },
    }),
  );

const accessSources = {
  'access.bootstrap-owner.v2': {
    manifestExportName: 'bootstrapOwnerCellDeclaration',
    assemblyExportName: 'makeAccessBootstrapCliSystem',
    assemblyKey: 'bootstrapOwner',
  },
  'access.begin-mfa-enrollment.v1': {
    manifestExportName: 'beginMfaEnrollmentCellDeclaration',
    assemblyKey: 'beginMfaEnrollment',
  },
  'access.complete-mfa-challenge.v1': {
    manifestExportName: 'completeMfaChallengeCellDeclaration',
    assemblyKey: 'completeMfaChallenge',
  },
  'access.confirm-mfa-enrollment.v1': {
    manifestExportName: 'confirmMfaEnrollmentCellDeclaration',
    assemblyKey: 'confirmMfaEnrollment',
  },
  'access.regenerate-mfa-recovery-codes.v1': {
    manifestExportName: 'regenerateMfaRecoveryCodesCellDeclaration',
    assemblyKey: 'regenerateMfaRecoveryCodes',
  },
  'access.remove-mfa.v1': {
    manifestExportName: 'removeMfaCellDeclaration',
    assemblyKey: 'removeMfa',
  },
  'access.list-active-business-locations.v1': {
    manifestExportName: 'listActiveBusinessLocationsCellDeclaration',
    assemblyKey: 'listActiveBusinessLocations',
  },
  'access.list-active-production-locations.v1': {
    manifestExportName: 'listActiveProductionLocationsCellDeclaration',
    assemblyKey: 'listActiveProductionLocations',
  },
  'access.list-effective-access-grants.v1': {
    manifestExportName: 'listEffectiveAccessGrantsCellDeclaration',
    assemblyKey: 'listEffectiveAccessGrants',
  },
  'access.reconcile-production-location.v1': {
    manifestExportName: 'reconcileProductionLocationCellDeclaration',
    assemblyKey: 'reconcileProductionLocation',
  },
  'access.resolve-location-ancestry.v1': {
    manifestExportName: 'resolveLocationAncestryCellDeclaration',
    assemblyKey: 'resolveLocationAncestry',
  },
  'access.resolve-production-visibility.v1': {
    manifestExportName: 'resolveProductionVisibilityCellDeclaration',
    assemblyKey: 'resolveProductionVisibility',
  },
  'access.list-identity-sessions.v1': {
    manifestExportName: 'listIdentitySessionsCellDeclaration',
    assemblyKey: 'listIdentitySessions',
  },
  'access.load-session.v1': {
    manifestExportName: 'loadSessionCellDeclaration',
    assemblyKey: 'loadSession',
  },
  'access.login.v1': {
    manifestExportName: 'loginCellDeclaration',
    assemblyKey: 'login',
  },
  'access.revoke-identity-sessions.v1': {
    manifestExportName: 'revokeIdentitySessionsCellDeclaration',
    assemblyKey: 'revokeIdentitySessions',
  },
  'access.revoke-session.v1': {
    manifestExportName: 'revokeSessionCellDeclaration',
    assemblyKey: 'revokeSession',
  },
  'access.grant-workforce-access.v1': {
    manifestExportName: 'grantWorkforceAccessCellDeclaration',
    assemblyKey: 'grantWorkforceAccess',
  },
  'access.revoke-workforce-access.v1': {
    manifestExportName: 'revokeWorkforceAccessCellDeclaration',
    assemblyKey: 'revokeWorkforceAccess',
  },
  'access.accept-workforce-invitation.v1': {
    manifestExportName: 'acceptWorkforceInvitationCellDeclaration',
    assemblyKey: 'acceptWorkforceInvitation',
  },
  'access.issue-workforce-invitation.v1': {
    manifestExportName: 'issueWorkforceInvitationCellDeclaration',
    assemblyKey: 'issueWorkforceInvitation',
  },
  'access.list-workforce-invitations.v1': {
    manifestExportName: 'listWorkforceInvitationsCellDeclaration',
    assemblyKey: 'listWorkforceInvitations',
  },
  'access.preview-workforce-invitation.v1': {
    manifestExportName: 'previewWorkforceInvitationCellDeclaration',
    assemblyKey: 'previewWorkforceInvitation',
  },
  'access.reissue-workforce-invitation.v1': {
    manifestExportName: 'reissueWorkforceInvitationCellDeclaration',
    assemblyKey: 'reissueWorkforceInvitation',
  },
  'access.revoke-workforce-invitation.v1': {
    manifestExportName: 'revokeWorkforceInvitationCellDeclaration',
    assemblyKey: 'revokeWorkforceInvitation',
  },
  'access.get-workforce-member.v1': {
    manifestExportName: 'getWorkforceMemberCellDeclaration',
    assemblyKey: 'getWorkforceMember',
  },
  'access.list-workforce.v1': {
    manifestExportName: 'listWorkforceCellDeclaration',
    assemblyKey: 'listWorkforce',
  },
  'access.transition-workforce-membership.v1': {
    manifestExportName: 'transitionWorkforceMembershipCellDeclaration',
    assemblyKey: 'transitionWorkforceMembership',
  },
  'access.list-workforce-member-sessions.v1': {
    manifestExportName: 'listWorkforceMemberSessionsCellDeclaration',
    assemblyKey: 'listWorkforceMemberSessions',
  },
  'access.list-workforce-security-events.v1': {
    manifestExportName: 'listWorkforceSecurityEventsCellDeclaration',
    assemblyKey: 'listWorkforceSecurityEvents',
  },
  'access.revoke-workforce-member-sessions.v1': {
    manifestExportName: 'revokeWorkforceMemberSessionsCellDeclaration',
    assemblyKey: 'revokeWorkforceMemberSessions',
  },
} satisfies Readonly<
  Record<
    AccessOperationId,
    Readonly<{
      manifestExportName: string;
      assemblyExportName?: string;
      assemblyKey: string;
    }>
  >
>;

export const accessSystem = defineSystem({
  id: 'access',
  cells: accessCellDeclarations.map((manifest) => {
    const source = Reflect.get(accessSources, manifest.id) as Readonly<{
      manifestExportName: string;
      assemblyExportName?: string;
      assemblyKey: string;
    }>;
    return selectCell({
      manifest,
      source: {
        moduleSpecifier: '@pressly/access-system',
        manifestExportName: source.manifestExportName,
        assemblyExportName: source.assemblyExportName ?? 'makeAccessSystem',
        assemblyKey: source.assemblyKey,
      },
    });
  }),
});

const customerSystemDeclarations = Object.freeze({
  createCustomer: createCustomerCellDeclaration,
  getCustomer: getCustomerCellDeclaration,
  listCustomers: listCustomersCellDeclaration,
  resolveExactSourceCustomer: resolveExactSourceCustomerCellDeclaration,
  updateCustomer: updateCustomerCellDeclaration,
});

export const customersSystem = defineSystem({
  id: 'customers',
  cells: selectDeclarationMap({
    declarations: customerSystemDeclarations,
    manifestExportNames: {
      createCustomer: 'createCustomerCellDeclaration',
      getCustomer: 'getCustomerCellDeclaration',
      listCustomers: 'listCustomersCellDeclaration',
      resolveExactSourceCustomer: 'resolveExactSourceCustomerCellDeclaration',
      updateCustomer: 'updateCustomerCellDeclaration',
    },
    moduleSpecifier: '@pressly/customers-system',
    assemblyExportName: 'makeCustomersSystem',
  }),
});

const pricingSystemDeclarations = Object.freeze({
  loadPricingCatalog: loadPricingCatalogCellDeclaration,
  planPricingChange: planPricingChangeCellDeclaration,
  publishPricingChange: publishPricingChangeCellDeclaration,
});

export const pricingSystem = defineSystem({
  id: 'pricing',
  cells: selectDeclarationMap({
    declarations: pricingSystemDeclarations,
    manifestExportNames: {
      loadPricingCatalog: 'loadPricingCatalogCellDeclaration',
      planPricingChange: 'planPricingChangeCellDeclaration',
      publishPricingChange: 'publishPricingChangeCellDeclaration',
    },
    moduleSpecifier: '@pressly/pricing-system',
    assemblyExportName: 'makePricingSystem',
  }),
});

export const customerExperience = defineExperience({
  id: 'customer',
  cells: selectDeclarationMap({
    declarations: customerAuthCellDeclarations,
    manifestExportNames: {
      login: 'customerLoginCellDeclaration',
      loadSession: 'customerLoadSessionCellDeclaration',
      logout: 'customerLogoutCellDeclaration',
      completeMfaChallenge: 'customerCompleteMfaChallengeCellDeclaration',
      listIdentitySessions: 'customerListIdentitySessionsCellDeclaration',
      revokeAllIdentitySessions:
        'customerRevokeAllIdentitySessionsCellDeclaration',
      revokeIdentitySession: 'customerRevokeIdentitySessionCellDeclaration',
      beginMfaEnrollment: 'customerBeginMfaEnrollmentCellDeclaration',
      confirmMfaEnrollment: 'customerConfirmMfaEnrollmentCellDeclaration',
      regenerateMfaRecoveryCodes:
        'customerRegenerateMfaRecoveryCodesCellDeclaration',
      removeMfa: 'customerRemoveMfaCellDeclaration',
    },
    moduleSpecifier: '@pressly/experience-customer',
    assemblyExportName: 'makeCustomerExperience',
  }),
  features: [
    selectExperienceFeature({
      manifest: customerOrderEntryFeature,
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerOrderEntryFeature',
        repositoryPath:
          'experiences/customer/src/web/features/order-entry/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: customerPricingFeature,
      source: {
        moduleSpecifier: '@pressly/experience-customer',
        manifestExportName: 'customerPricingFeature',
        repositoryPath:
          'experiences/customer/src/web/features/pricing/feature.ts',
      },
    }),
  ],
  uses: ['pricing.load-pricing-catalog.v1'],
});

export const controlExperience = defineExperience({
  id: 'control',
  cells: [
    ...selectDeclarationMap({
      declarations: controlCellDeclarations,
      manifestExportNames: {
        login: 'controlLoginCellDeclaration',
        completeMfaChallenge: 'controlCompleteMfaChallengeCellDeclaration',
        loadSession: 'controlLoadSessionCellDeclaration',
        logout: 'controlLogoutCellDeclaration',
        listIdentitySessions: 'controlListIdentitySessionsCellDeclaration',
        revokeAllIdentitySessions:
          'controlRevokeAllIdentitySessionsCellDeclaration',
        revokeIdentitySession: 'controlRevokeIdentitySessionCellDeclaration',
        beginMfaEnrollment: 'controlBeginMfaEnrollmentCellDeclaration',
        confirmMfaEnrollment: 'controlConfirmMfaEnrollmentCellDeclaration',
        regenerateMfaRecoveryCodes:
          'controlRegenerateMfaRecoveryCodesCellDeclaration',
        removeMfa: 'controlRemoveMfaCellDeclaration',
        cliAuthApiLogin: 'controlCliAuthApiLoginCellDeclaration',
        cliAuthApiCompleteMfaChallenge:
          'controlCliAuthApiCompleteMfaChallengeCellDeclaration',
        cliAuthApiLoadSession: 'controlCliAuthApiLoadSessionCellDeclaration',
        cliAuthApiLogout: 'controlCliAuthApiLogoutCellDeclaration',
        cliAuthApiBeginMfaEnrollment:
          'controlCliAuthApiBeginMfaEnrollmentCellDeclaration',
        cliAuthApiConfirmMfaEnrollment:
          'controlCliAuthApiConfirmMfaEnrollmentCellDeclaration',
        cliAuthApiRegenerateMfaRecoveryCodes:
          'controlCliAuthApiRegenerateMfaRecoveryCodesCellDeclaration',
        cliAuthApiRemoveMfa: 'controlCliAuthApiRemoveMfaCellDeclaration',
        resolveAccess: 'resolveControlAccessCellDeclaration',
        listCustomers: 'listControlCustomersCellDeclaration',
        getCustomer: 'getControlCustomerCellDeclaration',
        createCustomer: 'createControlCustomerCellDeclaration',
        updateCustomer: 'updateControlCustomerCellDeclaration',
        listOrders: 'listControlOrdersCellDeclaration',
        getOrder: 'getControlOrderCellDeclaration',
        createOrder: 'createControlOrderCellDeclaration',
        correctOrder: 'correctControlOrderCellDeclaration',
        listMembers: 'listControlMembersCellDeclaration',
        getMember: 'getControlMemberCellDeclaration',
        listMemberSessions: 'listControlMemberSessionsCellDeclaration',
        revokeMemberSessions: 'revokeControlMemberSessionsCellDeclaration',
        listInvitations: 'listControlInvitationsCellDeclaration',
        issueInvitation: 'issueControlInvitationCellDeclaration',
        reissueInvitation: 'reissueControlInvitationCellDeclaration',
        revokeInvitation: 'revokeControlInvitationCellDeclaration',
        suspendMembership: 'suspendControlMembershipCellDeclaration',
        reactivateMembership: 'reactivateControlMembershipCellDeclaration',
        endMembership: 'endControlMembershipCellDeclaration',
        grantAccess: 'grantControlAccessCellDeclaration',
        revokeAccess: 'revokeControlAccessCellDeclaration',
        listSecurityEvents: 'listControlSecurityEventsCellDeclaration',
        previewInvitation: 'previewControlInvitationCellDeclaration',
        acceptNewInvitation: 'acceptNewControlInvitationCellDeclaration',
        acceptExistingInvitation:
          'acceptExistingControlInvitationCellDeclaration',
        acceptExistingInvitationPassword:
          'acceptExistingPasswordCellDeclaration',
        acceptExistingInvitationMfa: 'acceptExistingMfaCellDeclaration',
      },
      moduleSpecifier: '@pressly/experience-control',
      assemblyExportName: 'makeControlExperience',
    }),
    ...selectDeclarationMap({
      declarations: adminCliCellDeclarations,
      manifestExportNames: {
        login: 'adminCliAuthLoginCellDeclaration',
        session: 'adminCliAuthSessionCellDeclaration',
        logout: 'adminCliAuthLogoutCellDeclaration',
        mfaEnroll: 'adminCliAuthMfaEnrollCellDeclaration',
        mfaConfirm: 'adminCliAuthMfaConfirmCellDeclaration',
        mfaRecoveryCodes: 'adminCliAuthMfaRecoveryCodesCellDeclaration',
        mfaRemove: 'adminCliAuthMfaRemoveCellDeclaration',
        show: 'adminCliPricingShowCellDeclaration',
        plan: 'adminCliPricingPlanCellDeclaration',
        publish: 'adminCliPricingPublishCellDeclaration',
        productionBootstrap: 'adminCliProductionBootstrapCellDeclaration',
      },
      moduleSpecifier: '@pressly/experience-control',
      assemblyExportName: 'makeAdminCliExperience',
    }),
  ],
  features: [
    selectExperienceFeature({
      manifest: controlAuthenticationFeature,
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlAuthenticationFeature',
        repositoryPath:
          'experiences/control/src/features/authentication/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: controlConfigurationFeature,
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlConfigurationFeature',
        repositoryPath:
          'experiences/control/src/features/configuration/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: controlCustomersFeature,
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlCustomersFeature',
        repositoryPath: 'experiences/control/src/features/customers/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: controlOrdersFeature,
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlOrdersFeature',
        repositoryPath: 'experiences/control/src/features/orders/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: controlSecurityFeature,
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlSecurityFeature',
        repositoryPath: 'experiences/control/src/features/security/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: controlTeamFeature,
      source: {
        moduleSpecifier: '@pressly/experience-control',
        manifestExportName: 'controlTeamFeature',
        repositoryPath: 'experiences/control/src/features/team/feature.ts',
      },
    }),
  ],
  uses: [],
});

export const processorExperience = defineExperience({
  id: 'processor',
  cells: selectDeclarationMap({
    declarations: processorCellDeclarations,
    manifestExportNames: {
      loadBoard: 'loadProcessorProductionBoardCellDeclaration',
      previewOrderBacklog:
        'previewProcessorProductionOrderBacklogCellDeclaration',
      loadWorkspace: 'loadProcessorProductionWorkspaceCellDeclaration',
      loadRemainingDayForecast:
        'loadProcessorRemainingDayForecastCellDeclaration',
      listHistoryActivity:
        'listProcessorProductionHistoryActivityCellDeclaration',
      loadHistoryRun: 'loadProcessorProductionHistoryRunCellDeclaration',
      listOrderControl: 'listProcessorProductionOrderControlCellDeclaration',
      resolveAccess: 'resolveProcessorAccessCellDeclaration',
      login: 'processorLoginCellDeclaration',
      completeMfaChallenge: 'processorCompleteMfaChallengeCellDeclaration',
      loadSession: 'processorLoadSessionCellDeclaration',
      logout: 'processorLogoutCellDeclaration',
    },
    moduleSpecifier: '@pressly/experience-processor/server',
    assemblyExportName: 'makeProcessorExperience',
  }),
  features: [
    selectExperienceFeature({
      manifest: processorAuthenticationFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorAuthenticationFeature',
        repositoryPath:
          'experiences/processor/src/features/authentication/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorForecastFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorForecastFeature',
        repositoryPath:
          'experiences/processor/src/features/forecast/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorHistoryFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorHistoryFeature',
        repositoryPath: 'experiences/processor/src/features/history/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorIntakeFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorIntakeFeature',
        repositoryPath: 'experiences/processor/src/features/intake/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorLocationSelectionFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorLocationSelectionFeature',
        repositoryPath:
          'experiences/processor/src/features/location-selection/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorOrderControlFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorOrderControlFeature',
        repositoryPath:
          'experiences/processor/src/features/order-control/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorOrderResolutionFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorOrderResolutionFeature',
        repositoryPath:
          'experiences/processor/src/features/order-resolution/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorProductionBoardFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorProductionBoardFeature',
        repositoryPath:
          'experiences/processor/src/features/production-board/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorSchedulingFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorSchedulingFeature',
        repositoryPath:
          'experiences/processor/src/features/scheduling/feature.ts',
      },
    }),
    selectExperienceFeature({
      manifest: processorSettingsFeature,
      source: {
        moduleSpecifier: '@pressly/experience-processor',
        manifestExportName: 'processorSettingsFeature',
        repositoryPath:
          'experiences/processor/src/features/settings/feature.ts',
      },
    }),
  ],
  uses: [
    'orders.accept-incoming-order-proposal.v1',
    'orders.list-incoming-order-proposals.v1',
    'orders.reject-incoming-order-proposal.v1',
    'orders.restore-incoming-order-proposal.v1',
    'production.accept-schedule.v1',
    'production.advance-stage.v1',
    'production.assign-stage-machines.v1',
    'production.change-admission.v1',
    'production.change-order-resolution.v1',
    'production.commit-order-backlog.v1',
    'production.commit-order-route.v1',
    'production.confirm-order-overtime.v1',
    'production.create-schedule.v1',
    'production.create-shift.v1',
    'production.freeze-batch-membership.v1',
    'production.list-history-activity.v1',
    'production.list-history-plans.v1',
    'production.list-history-runs.v1',
    'production.list-locations.v1',
    'production.list-order-control.v1',
    'production.list-orders.v1',
    'production.load-board.v1',
    'production.load-history-run.v1',
    'production.load-remaining-day-forecast.v1',
    'production.load-schedule.v1',
    'production.load-workspace.v1',
    'production.place-order-automatically.v1',
    'production.place-order-exactly.v1',
    'production.preview-order-backlog.v1',
    'production.preview-order-route.v1',
    'production.publish-scheduler-config.v1',
    'production.reconcile-batch-progress.v1',
    'production.record-order-intake.v1',
    'production.replace-shift-selection.v1',
    'production.set-order-priority.v1',
    'production.start-schedule.v1',
    'production.subscribe-changes.v1',
    'production.unfreeze-batch-membership.v1',
    'production.update-shift.v1',
  ],
});
