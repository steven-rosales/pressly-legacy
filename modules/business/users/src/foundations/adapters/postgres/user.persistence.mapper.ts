import { invariantViolationError } from '@pressly/errors/factories';
import type { StoredUserCommandReceipt } from '../../language/command-identity/user-command-result.model.ts';
import type { User } from '../../language/users/user.entity.ts';

const storedUserInvariant = (code: string, message: string) =>
  invariantViolationError({
    code,
    message,
    safeMessage: 'Stored user data is inconsistent.',
  });

export const mapStoredUserCommandReceipt = (row: {
  commandHash: string;
  result: unknown;
}): StoredUserCommandReceipt => {
  const stored = row.result;

  if (
    stored === null ||
    typeof stored !== 'object' ||
    !('userId' in stored) ||
    !('version' in stored) ||
    typeof stored.userId !== 'string' ||
    typeof stored.version !== 'number'
  )
    throw storedUserInvariant(
      'user_command_receipt_invalid',
      'Stored user command result is invalid.',
    );

  return {
    commandHash: row.commandHash,
    result: { userId: stored.userId, version: stored.version, replayed: false },
  };
};

export const mapStoredUser = (row: {
  id: string;
  businessId: string;
  version: number;
  active: boolean;
  firstName: string | null;
  lastName: string | null;
  businessName: string | null;
  phone: string | null;
  email: string | null;
}): User => ({
  id: row.id,
  businessId: row.businessId,
  version: row.version,
  active: row.active,
  firstName: row.firstName,
  lastName: row.lastName,
  businessName: row.businessName,
  phone: row.phone,
  email: row.email,
});
