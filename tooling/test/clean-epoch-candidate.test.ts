import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AppError } from '@pressly/errors/app-error';
import {
  assertLegacyMigrationLedger,
  deriveDatabaseUrl,
  migrationLedgerSha256,
  parseCleanEpochCutoverDeclaration,
} from '../postgres/prepare-clean-epoch-candidate.ts';
import { describe, expect, it } from 'vitest';

const declarationPath = fileURLToPath(
  new URL(
    '../../deploy/aws/lightsail/clean-epoch-cutover.json',
    import.meta.url,
  ),
);
const declarationJson = (): unknown =>
  JSON.parse(readFileSync(declarationPath, 'utf8')) as unknown;
const appErrorCode = (error: unknown): string | undefined =>
  (error as Partial<AppError>).code;

describe('clean database epoch candidate declaration', () => {
  it('pins every legacy ledger row and the exact clean target', () => {
    const declaration = parseCleanEpochCutoverDeclaration(declarationJson());

    expect(declaration.legacy.entries).toHaveLength(40);
    expect(declaration.legacy.entries[0]).toMatchObject({
      id: 1,
      tag: '0001_pricing',
      hash: '5c4107137b3f2d5881a25211a50c7c3d4222e2a2e7fdd2d0cd3086a750b23cfe',
      createdAt: 1778523826077,
    });
    expect(declaration.legacy.entries.at(-1)).toMatchObject({
      id: 40,
      tag: '0040_flashy_colossus',
      hash: '85a3ba672c3037bb5248f5ac0050c6452139c76ea2c9d9a05fd89ad266956df5',
      createdAt: 1786065143044,
    });
    expect(migrationLedgerSha256(declaration.legacy.entries)).toBe(
      'c91f202242118f9d515198e843a587c8746afab85515716697d86eb682090fa2',
    );
    expect(declaration.target).toMatchObject({
      entryCount: 2,
      orderedLedgerSha256:
        '627f1c15f986a6b1af3ee4f456ad4c9c3cc0cf4de90748c1c8bed812b7524f65',
      publicTableCount: 59,
      publicEnumCount: 6,
    });
    expect(declaration).toMatchObject({
      cutoverId: 'clean-owner-epoch-v1',
      legacyReleaseSha: 'f0d38b7d6b8a5576f62760bd984439def4351a1e',
      legacyLedgerSha256:
        'c91f202242118f9d515198e843a587c8746afab85515716697d86eb682090fa2',
      targetJournalSha256:
        '4b3a8eac8cde509ce43ae8e9b2f1608a7ce40f30548978250715a1d157a69e2a',
      targetTreeSha256:
        '8436950407887c0eb5ada951921dc80b56b03d96c03a9303d6c202a3b74dcbc6',
    });
    expect(declaration.preservation).toEqual({
      owner: 'pricing',
      copyOrder: [
        'pricing_services',
        'pricing_sets',
        'pricing_items',
        'pricing_change_events',
      ],
      discard: 'all-non-pricing-data',
    });
  });

  it('rejects one changed legacy row even when the row count stays 40', () => {
    const raw = declarationJson() as {
      legacy: { entries: Array<{ hash: string }> };
    };
    const entry = raw.legacy.entries[19];
    if (entry === undefined) throw new Error('fixture entry is missing');
    entry.hash = '0'.repeat(64);

    expect(() => parseCleanEpochCutoverDeclaration(raw)).toThrowError(
      expect.objectContaining({ code: 'clean_epoch_declaration_invalid' }),
    );
  });

  it('rejects database-ledger drift at the exact changed tuple', () => {
    const declaration = parseCleanEpochCutoverDeclaration(declarationJson());
    const rows = declaration.legacy.entries.map((entry) => ({ ...entry }));
    const changed = rows[12];
    if (changed === undefined) throw new Error('fixture row is missing');
    changed.createdAt += 1;

    expect(() => assertLegacyMigrationLedger(rows, declaration)).toThrowError(
      expect.objectContaining({ code: 'clean_epoch_legacy_ledger_mismatch' }),
    );
  });

  it('derives a candidate URL internally without weakening URL identity checks', () => {
    const derived = new URL(
      deriveDatabaseUrl(
        'postgres://pressly:top-secret@localhost:55434/pressly?sslmode=disable',
        'pressly_epoch_20260825',
      ),
    );

    expect(derived.pathname).toBe('/pressly_epoch_20260825');
    expect(derived.searchParams.get('sslmode')).toBe('disable');
    expect(derived.password).toBe('top-secret');
    expect(() =>
      deriveDatabaseUrl(
        'postgres://pressly:top-secret@localhost:55434/pressly',
        'pressly;drop database pressly',
      ),
    ).toThrowError(
      expect.objectContaining({ code: 'clean_epoch_database_name_invalid' }),
    );
  });

  it('keeps typed failure codes available without serializing private causes', () => {
    const raw = declarationJson() as { schemaVersion: number };
    raw.schemaVersion = 2;
    try {
      parseCleanEpochCutoverDeclaration(raw);
      throw new Error('expected declaration rejection');
    } catch (error) {
      expect(appErrorCode(error)).toBe('clean_epoch_declaration_invalid');
      expect(JSON.stringify(error)).not.toContain('cause');
    }
  });
});
