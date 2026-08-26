import { accessCellDeclarations } from '@pressly/access-system';
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
import { defineExperience, defineSystem } from './src/public.ts';

export const accessSystem = defineSystem({
  id: 'access',
  cells: accessCellDeclarations,
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
  cells: Object.values(customerSystemDeclarations),
});

const pricingSystemDeclarations = Object.freeze({
  loadPricingCatalog: loadPricingCatalogCellDeclaration,
  planPricingChange: planPricingChangeCellDeclaration,
  publishPricingChange: publishPricingChangeCellDeclaration,
});

export const pricingSystem = defineSystem({
  id: 'pricing',
  cells: Object.values(pricingSystemDeclarations),
});

export const customerExperience = defineExperience({
  id: 'customer',
  cells: Object.values(customerAuthCellDeclarations),
  features: [customerOrderEntryFeature, customerPricingFeature],
  uses: ['pricing.load-pricing-catalog.v1'],
});

export const controlExperience = defineExperience({
  id: 'control',
  cells: [
    ...Object.values(controlCellDeclarations),
    ...Object.values(adminCliCellDeclarations),
  ],
  features: [
    controlAuthenticationFeature,
    controlConfigurationFeature,
    controlCustomersFeature,
    controlOrdersFeature,
    controlSecurityFeature,
    controlTeamFeature,
  ],
  uses: [],
});

export const processorExperience = defineExperience({
  id: 'processor',
  cells: Object.values(processorCellDeclarations),
  features: [
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
