import { describe, expect, it } from 'vitest';
import { selectDeploySha } from '../scripts/deployment-selection.mjs';

const sha = '0123456789abcdef0123456789abcdef01234567';

describe('deployment selection', () => {
  it('selects the immutable SHA from a successful workflow run event', () => {
    expect(
      selectDeploySha({ eventName: 'workflow_run', workflowRunSha: sha }),
    ).toBe(sha);
  });

  it('accepts a full commit SHA for an approved manual redeploy', () => {
    expect(
      selectDeploySha({ eventName: 'workflow_dispatch', manualSha: sha }),
    ).toBe(sha);
  });

  it('rejects moving refs and malformed SHAs', () => {
    expect(() =>
      selectDeploySha({ eventName: 'workflow_dispatch', manualSha: 'main' }),
    ).toThrow();
    expect(() =>
      selectDeploySha({
        eventName: 'workflow_run',
        workflowRunSha: `${sha}; touch /tmp/injected`,
      }),
    ).toThrow();
  });

  it('rejects events that are not deployment entry points', () => {
    expect(() =>
      selectDeploySha({ eventName: 'push', manualSha: sha }),
    ).toThrow();
  });
});
