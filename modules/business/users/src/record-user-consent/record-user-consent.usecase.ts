import { isCommandContextValid, result } from '@pressly/kernel';
import { userError } from '../user.error.ts';
import type { RecordUserConsent } from '../users.port.ts';
import type { RecordUserConsentRepository } from './record-user-consent.port.ts';

export const makeRecordUserConsent =
  (repo: RecordUserConsentRepository): RecordUserConsent =>
  async (command) => {
    if (
      command.source.trim() === '' ||
      !isCommandContextValid(command.context) ||
      command.externalUserId.trim() === '' ||
      command.idempotencyKey.trim() === '' ||
      command.kind.trim() === '' ||
      !/^[a-f0-9]{64}$/.test(command.sourcePayloadHash)
    )
      return result.err(
        userError(
          'USER_CONSENT_INVALID',
          'The user consent observation is incomplete.',
          400,
        ),
      );
    try {
      const outcome = await repo.transaction(async (operations) => {
        await operations.lockConsent(command.idempotencyKey);
        const existing = await operations.loadConsent(command.idempotencyKey);
        if (existing !== null)
          return existing.sourcePayloadHash === command.sourcePayloadHash &&
            existing.source === command.source &&
            existing.kind === command.kind &&
            existing.granted === command.granted
            ? {
                kind: 'ok' as const,
                value: { userId: existing.userId, replayed: true },
              }
            : { kind: 'idempotency_conflict' as const };

        const resolved = await operations.resolveSource(command);
        if (resolved === null) return { kind: 'not_found' as const };
        const value = await operations.insertConsent({
          command,
          userId: resolved.userId,
        });
        return { kind: 'ok' as const, value };
      });
      if (outcome.kind === 'ok') return result.ok(outcome.value);
      if (outcome.kind === 'not_found')
        return result.err(
          userError(
            'USER_SOURCE_NOT_FOUND',
            'The source user must be observed before consent is recorded.',
            404,
          ),
        );
      return result.err(
        userError(
          'USER_CONSENT_CONFLICT',
          'The consent idempotency key contains different data.',
        ),
      );
    } catch (error) {
      return result.err(
        userError(
          'USER_CONSENT_FAILED',
          'The user consent observation could not be stored.',
          503,
          error,
        ),
      );
    }
  };
