import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { andThen, err, mapError, mapResult, ok } from './result.js';

describe('Result', () => {
  it('maps ok values', () => {
    assert.deepEqual(
      mapResult(ok(2), (value) => value * 2),
      ok(4),
    );
  });

  it('does not map err values', () => {
    assert.deepEqual(
      mapResult(err('failed'), (value: number) => value * 2),
      err('failed'),
    );
  });

  it('maps errors', () => {
    assert.deepEqual(
      mapError(err('failed'), (error) => error.toUpperCase()),
      err('FAILED'),
    );
  });

  it('chains ok values', () => {
    assert.deepEqual(
      andThen(ok(2), (value) => ok(value + 1)),
      ok(3),
    );
  });
});
