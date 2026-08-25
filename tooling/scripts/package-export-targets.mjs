const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const ownedTargetTuple = (value, conditions = []) => {
  if (typeof value === 'string')
    return value.startsWith('./')
      ? [[conditions.length === 0 ? 'default' : conditions.join('.'), value]]
      : null;

  if (Array.isArray(value)) {
    const entries = [];
    for (const [index, candidate] of value.entries()) {
      const tuple = ownedTargetTuple(candidate, [...conditions, `[${index}]`]);
      if (tuple === null) return null;
      entries.push(...tuple);
    }
    return entries;
  }

  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  const entries = [];
  for (const condition of keys) {
    const tuple = ownedTargetTuple(value[condition], [
      ...conditions,
      condition,
    ]);
    if (tuple === null) return null;
    entries.push(...tuple);
  }
  return entries;
};

export const duplicateOwnedPackageExportTargets = (manifest) => {
  if (!isRecord(manifest) || !isRecord(manifest.exports)) return [];

  const byTuple = new Map();
  for (const [specifier, target] of Object.entries(manifest.exports)) {
    if (!specifier.startsWith('.')) continue;
    const tuple = ownedTargetTuple(target);
    if (tuple === null || tuple.length === 0) continue;
    const identity = JSON.stringify(tuple);
    const existing = byTuple.get(identity) ?? [];
    existing.push(specifier);
    byTuple.set(identity, existing);
  }

  return [...byTuple.entries()]
    .filter(([, specifiers]) => specifiers.length > 1)
    .map(([targetTuple, specifiers]) => ({
      specifiers: Object.freeze([...specifiers].sort()),
      targetTuple,
    }))
    .sort((left, right) =>
      left.specifiers[0] < right.specifiers[0]
        ? -1
        : left.specifiers[0] > right.specifiers[0]
          ? 1
          : 0,
    );
};
