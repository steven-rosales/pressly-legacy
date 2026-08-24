export type ExperienceFeatureManifest<
  Id extends string = string,
  Uses extends readonly string[] = readonly string[],
  StateProofs extends readonly string[] = readonly string[],
  ComponentProofs extends readonly string[] = readonly string[],
> = Readonly<{
  id: Id;
  uses: Uses;
  stateProofs: StateProofs;
  componentProofs: ComponentProofs;
}>;

/**
 * Declares one browser-facing Experience feature without coupling it to a
 * framework, runtime, or backend implementation.
 */
export const defineExperienceFeature = <
  const Id extends string,
  const Uses extends readonly string[],
  const StateProofs extends readonly string[],
  const ComponentProofs extends readonly [string, ...string[]],
>(
  manifest: ExperienceFeatureManifest<Id, Uses, StateProofs, ComponentProofs>,
): ExperienceFeatureManifest<Id, Uses, StateProofs, ComponentProofs> =>
  Object.freeze({
    id: manifest.id,
    uses: Object.freeze(manifest.uses),
    stateProofs: Object.freeze(manifest.stateProofs),
    componentProofs: Object.freeze(manifest.componentProofs),
  });
