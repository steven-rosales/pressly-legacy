import { makeAppError } from '@pressly/errors';
import { makeTestWebCore } from '@/common/testing/make-test-web-core';

describe('core.command.run', () => {
  it('returns the command value and records success feedback', async () => {
    const core = makeTestWebCore();

    const result = await core.command.run({
      meta: {
        action: 'save_preferences',
        rail: 'command',
        criticality: 'medium',
      },
      work: async () => 'saved',
      feedback: { loading: 'Saving...', success: 'Saved.' },
    });

    expect(result).toBe('saved');
    expect(core.calls.feedback).toEqual([
      { kind: 'loading', message: { title: 'Saving...' } },
      { kind: 'dismiss', id: 'loading-id' },
      { kind: 'success', message: { title: 'Saved.' } },
    ]);
    expect(core.calls.errors).toHaveLength(0);
  });

  it('normalizes failure, reports it, shows feedback, and throws AppError', async () => {
    const core = makeTestWebCore();

    const appError = makeAppError({
      kind: 'ValidationError',
      code: 'invalid_contact_form',
      message: 'Contact form was invalid.',
      safeMessage: 'Please check the form.',
      status: 400,
    });

    await expect(
      core.command.run({
        meta: {
          action: 'submit_contract_form',
          rail: 'command',
          criticality: 'high',
          source: 'contact',
        },
        work: async () => {
          throw appError;
        },
        feedback: {
          loading: 'Submitting form...',
          success: 'Form submitted',
          error: 'Could not submit contract form.',
        },
      }),
    ).rejects.toMatchObject({
      tag: 'AppError',
      code: 'invalid_contact_form',
    });

    expect(core.calls.errors).toHaveLength(1);
    expect(core.calls.feedback).toContainEqual({
      kind: 'error',
      message: { title: 'Could not submit contract form.' },
    });
  });
});
