export const productionActorReadV1CapabilityContract = Object.freeze({
  id: 'access.production-actor-read.v1',
  version: 1,
  transaction: 'owner-owned',
  result: 'typed-actor-facts',
} as const);

export type ProductionActorV1 = Readonly<{
  id: string;
  displayName: string | null;
}>;

/**
 * Access-owned actor facts for Production history. Access executes every
 * identity query on its own database dependency; consumers receive data only.
 */
export type ProductionActorReadV1Capability = Readonly<{
  contract: typeof productionActorReadV1CapabilityContract;
  loadActors: (
    input: Readonly<{
      actorIds: readonly string[];
    }>,
  ) => Promise<readonly ProductionActorV1[]>;
  findActorIdsByDisplayName: (
    input: Readonly<{
      query: string;
    }>,
  ) => Promise<readonly string[]>;
}>;
