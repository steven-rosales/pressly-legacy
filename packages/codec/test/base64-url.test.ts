import { describe, expect, it } from 'vitest';
import {
  decodeBase64UrlJson,
  decodeBase64UrlText,
  encodeBase64UrlJson,
  encodeBase64UrlText,
} from '../src/base64-url.ts';

describe('base64-url codecs', () => {
  it('round-trips Unicode text without Node Buffer', () => {
    const encoded = encodeBase64UrlText('Pressly — 🧺');

    expect(encoded).not.toContain('=');
    expect(decodeBase64UrlText(encoded)).toBe('Pressly — 🧺');
    expect(decodeBase64UrlText('%%%')).toBeNull();
  });

  it('decodes only strict JSON values', () => {
    const value = { version: 1, filters: ['open', null] } as const;

    expect(decodeBase64UrlJson(encodeBase64UrlJson(value))).toEqual(value);
    expect(
      decodeBase64UrlJson(encodeBase64UrlText('{"value":1e999}')),
    ).toBeNull();
    expect(decodeBase64UrlJson(encodeBase64UrlText('not-json'))).toBeNull();
  });
});
