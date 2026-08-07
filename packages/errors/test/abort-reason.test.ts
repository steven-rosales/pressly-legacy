import { describe, expect, it } from 'vitest';
import { abortReasonNames, makeAbortReason } from '../src/abort-reason.js';

describe('makeAbortReason', () => {
  it.each(abortReasonNames)(
    'constructs the native %s platform reason',
    (name) => {
      const reason = makeAbortReason({
        name,
        message: 'Operation interrupted.',
      });

      expect(reason).toBeInstanceOf(DOMException);
      expect(reason.name).toBe(name);
      expect(reason.message).toBe('Operation interrupted.');
    },
  );
});
