import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  composeMetricCatalog,
  defineMetricDescriptors,
} from '../src/metric-catalog-algebra.js';

describe('metric catalog algebra', () => {
  it('composes immutable descriptors without erasing finite vocabularies', () => {
    const descriptors = defineMetricDescriptors(
      {
        name: 'runtime.requests',
        instrument: 'counter',
        unit: 'count',
        allowedAttributes: ['method', 'outcome'],
        attributeValues: {
          method: ['GET', 'POST'],
          outcome: ['completed', 'aborted'],
        },
      },
      {
        name: 'runtime.request_duration_seconds',
        instrument: 'distribution',
        unit: 'second',
        allowedAttributes: ['method'],
        attributeValues: { method: ['GET', 'POST'] },
      },
    );

    const result = composeMetricCatalog(descriptors);

    expect(result.kind).toBe('ready');
    if (result.kind !== 'ready') return;
    expect(result.catalog['runtime.requests']).toEqual({
      instrument: 'counter',
      unit: 'count',
      allowedAttributes: ['method', 'outcome'],
      attributeValues: {
        method: ['GET', 'POST'],
        outcome: ['completed', 'aborted'],
      },
    });
    expect(Object.isFrozen(descriptors)).toBe(true);
    expect(Object.isFrozen(result.catalog)).toBe(true);
  });

  it('returns every duplicate name instead of choosing an implicit owner', () => {
    const first = defineMetricDescriptors({
      name: 'runtime.requests',
      instrument: 'counter',
      unit: 'count',
      allowedAttributes: [],
    });
    const second = defineMetricDescriptors(
      {
        name: 'runtime.requests',
        instrument: 'counter',
        unit: 'count',
        allowedAttributes: [],
      },
      {
        name: 'runtime.requests',
        instrument: 'counter',
        unit: 'count',
        allowedAttributes: [],
      },
    );

    expect(composeMetricCatalog(first, second)).toEqual({
      kind: 'collision',
      duplicateNames: ['runtime.requests'],
    });
  });

  it('keeps the reusable algebra free of owner business vocabulary', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/metric-catalog-algebra.ts'),
      'utf8',
    );
    const ownerVocabulary = [
      /\bproduction\b/i,
      /\bingress\b/i,
      /\borders?\b/i,
      /\bcents\b/i,
      /\bwebhooks?\b/i,
      /\bcustomers?\b/i,
      /\bworkers?\b/i,
    ];

    for (const vocabulary of ownerVocabulary)
      expect(source).not.toMatch(vocabulary);
  });
});
