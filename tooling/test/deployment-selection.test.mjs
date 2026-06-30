import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { selectDeploySha } from '../scripts/deployment-selection.mjs';

const sha = '0123456789abcdef0123456789abcdef01234567';

describe('deployment selection', () => {
  it('selects the immutable SHA from a successful workflow run event', () => {
    assert.equal(
      selectDeploySha({ eventName: 'workflow_run', workflowRunSha: sha }),
      sha,
    );
  });

  it('accepts a full commit SHA for an approved manual redeploy', () => {
    assert.equal(
      selectDeploySha({ eventName: 'workflow_dispatch', manualSha: sha }),
      sha,
    );
  });

  it('rejects moving refs and malformed SHAs', () => {
    assert.throws(() =>
      selectDeploySha({ eventName: 'workflow_dispatch', manualSha: 'main' }),
    );
    assert.throws(() =>
      selectDeploySha({
        eventName: 'workflow_run',
        workflowRunSha: `${sha}; touch /tmp/injected`,
      }),
    );
  });

  it('rejects events that are not deployment entry points', () => {
    assert.throws(() => selectDeploySha({ eventName: 'push', manualSha: sha }));
  });
});
