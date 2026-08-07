import { type LpmsBootstrapManifest } from '@pressly/contracts/lpms';
import {
  productionBootstrapResultSchema,
  type ProductionBootstrapManifest as ProductionBootstrapWireManifest,
  type ProductionBootstrapResult as ProductionBootstrapWireResult,
} from '@pressly/contracts/production';
import {
  manageSourceLocationBindingsResultSchema,
  type ManageSourceLocationBindingsResult as ManageSourceLocationBindingsWireResult,
} from '@pressly/contracts/webhook-ingestion';
import type {
  ProductionBootstrapManifest,
  ProductionBootstrapResult,
} from '@pressly/production';
import type {
  ReconcileSourceLocationBindingsResult,
  SourceLocationBindingsManifest,
} from '@pressly/webhook-ingestion';

export const toSourceLocationBindingsManifest = (
  bindings: LpmsBootstrapManifest['sourceLocationBindings'],
): SourceLocationBindingsManifest => ({
  sourceLocationBindings: bindings.map((binding) => ({
    source: binding.source,
    externalLocationId: binding.externalLocationId,
    locationId: binding.locationId,
    isActive: binding.isActive,
  })),
});

export const toManageSourceLocationBindingsWireResult = (
  result: ReconcileSourceLocationBindingsResult,
): ManageSourceLocationBindingsWireResult =>
  manageSourceLocationBindingsResultSchema.parse({
    mode: result.mode,
    status: result.status,
    applied: result.applied,
    operations: result.operations.map((operation) => ({
      source: operation.source,
      externalLocationId: operation.externalLocationId,
      locationId: operation.locationId,
      outcome: operation.outcome,
    })),
    rejections: result.rejections.map((rejection) => ({
      source: rejection.source,
      externalLocationId: rejection.externalLocationId,
      code: rejection.code,
      message: rejection.message,
    })),
  });

export const toProductionBootstrapManifest = (
  manifest: ProductionBootstrapWireManifest,
): ProductionBootstrapManifest => ({
  schemaVersion: manifest.schemaVersion,
  location: {
    id: manifest.location.id,
    businessId: manifest.location.businessId,
    name: manifest.location.name,
    timezone: manifest.location.timezone,
    isActive: manifest.location.isActive,
  },
  stations: manifest.stations.map((station) => ({
    locationId: station.locationId,
    kind: station.kind,
    label: station.label,
    sortOrder: station.sortOrder,
    isActive: station.isActive,
  })),
  machines: manifest.machines.map((machine) => ({
    locationId: machine.locationId,
    stationKind: machine.stationKind,
    label: machine.label,
    manufacturerCapacityLbs: machine.manufacturerCapacityLbs,
    effectiveCapacityLbs: machine.effectiveCapacityLbs,
    capacitySafetyMarginLbs: machine.capacitySafetyMarginLbs,
    isActive: machine.isActive,
  })),
  schedulerConfig: {
    locationId: manifest.schedulerConfig.locationId,
    pulseMinutes: manifest.schedulerConfig.pulseMinutes,
    foldLbsPerFolderMinute: manifest.schedulerConfig.foldLbsPerFolderMinute,
    algorithmVersion: manifest.schedulerConfig.algorithmVersion,
    stageFitAssertion: {
      sortingFits: manifest.schedulerConfig.stageFitAssertion.sortingFits,
      washingFits: manifest.schedulerConfig.stageFitAssertion.washingFits,
      dryingFits: manifest.schedulerConfig.stageFitAssertion.dryingFits,
    },
  },
});

export const toProductionBootstrapWireResult = (
  result: ProductionBootstrapResult,
): ProductionBootstrapWireResult =>
  productionBootstrapResultSchema.parse({
    mode: result.mode,
    status: result.status,
    configurationHash: result.configurationHash,
    operations: result.operations.map((operation) => ({
      resourceType: operation.resourceType,
      naturalKey: operation.naturalKey,
      outcome: operation.outcome,
      changedFields: [...operation.changedFields],
    })),
    rejections: result.rejections.map((rejection) => ({
      resourceType: rejection.resourceType,
      naturalKey: rejection.naturalKey,
      outcome: rejection.outcome,
      code: rejection.code,
      message: rejection.message,
    })),
    summary: {
      created: result.summary.created,
      updated: result.summary.updated,
      noop: result.summary.noop,
      rejected: result.summary.rejected,
    },
    replayed: result.replayed,
    applied: result.applied,
  });
