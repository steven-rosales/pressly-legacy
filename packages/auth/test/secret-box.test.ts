import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { makeRecoveryCodeService } from '../src/credentials/recovery-code.ts';
import { makeSecretBox } from '../src/credentials/secret-box.ts';

describe('MFA secret protection', () => {
  it('encrypts and authenticates stored TOTP secrets', () => {
    const box = makeSecretBox(randomBytes(32).toString('base64'));
    const encrypted = box.encrypt('BASE32SECRET');
    const tamperedParts = encrypted.split('.');
    const tamperedTag = Buffer.from(tamperedParts[3]!, 'base64url');
    tamperedTag[0] = tamperedTag[0]! ^ 1;
    tamperedParts[3] = tamperedTag.toString('base64url');

    expect(encrypted).not.toContain('BASE32SECRET');
    expect(box.decrypt(encrypted)).toBe('BASE32SECRET');
    expect(() => box.decrypt(tamperedParts.join('.'))).toThrow();
  });

  it('generates high-entropy single-display recovery codes and hashes them', () => {
    const service = makeRecoveryCodeService();
    const codes = service.generate(10);

    expect(new Set(codes)).toHaveLength(10);
    expect(
      codes.every((code) => /^[A-F0-9]{4}(?:-[A-F0-9]{4}){5}$/.test(code)),
    ).toBe(true);
    expect(service.hash(codes[0]!)).not.toContain(codes[0]!);
    expect(service.hash(codes[0]!.toLowerCase())).toBe(service.hash(codes[0]!));
  });
});
