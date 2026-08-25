import { describe, expect, it } from 'vitest';
import {
  constantTimeBytesEqual,
  hmacSha256,
  utf8ByteLength,
} from '../src/hmac-sha256.ts';
import { makeBinarySecretBox } from '../src/secret-box.ts';

describe('cryptographic mechanisms', () => {
  it('derives and compares exact HMAC-SHA256 bytes', () => {
    const digest = hmacSha256('key', ['The quick brown fox']);

    expect(Buffer.from(digest).toString('hex')).toBe(
      '203d1e5cedd2d18f8c5a3beff0bd9c1ebcb97097dfcb288c46b00c9227fde2c0',
    );
    expect(constantTimeBytesEqual(digest, digest.slice())).toBe(true);
    expect(constantTimeBytesEqual(digest, new Uint8Array(32))).toBe(false);
    expect(utf8ByteLength('Pressly 🧺')).toBe(12);
  });

  it('round-trips binary secrets with authenticated context', () => {
    const box = makeBinarySecretBox(Buffer.alloc(32, 7).toString('base64'), {
      additionalAuthenticatedData: new TextEncoder().encode('pressly:test'),
    });
    const plainText = Uint8Array.from([0, 1, 127, 128, 255]);
    const envelope = box.encrypt(plainText);

    expect(box.decrypt(envelope)).toEqual(plainText);
    expect(() =>
      makeBinarySecretBox(Buffer.alloc(32, 7).toString('base64'), {
        additionalAuthenticatedData: new TextEncoder().encode('wrong'),
      }).decrypt(envelope),
    ).toThrow();
  });
});
