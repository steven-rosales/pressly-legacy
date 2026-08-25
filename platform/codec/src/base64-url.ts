import { isJsonValue, type JsonValue } from './json-value.ts';

export const encodeBase64Bytes = (value: Uint8Array): string => {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export const decodeBase64Bytes = (value: string): Uint8Array | null => {
  try {
    return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
};

export const encodeBase64UrlText = (value: string): string => {
  return encodeBase64Bytes(new TextEncoder().encode(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
};

export const decodeBase64UrlText = (value: string): string | null => {
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const bytes = decodeBase64Bytes(`${base64}${padding}`);
    return bytes === null ? null : new TextDecoder().decode(bytes);
  } catch {
    return null;
  }
};

export const encodeBase64UrlJson = (value: JsonValue): string =>
  encodeBase64UrlText(JSON.stringify(value));

export const decodeBase64UrlJson = (value: string): JsonValue | null => {
  const decoded = decodeBase64UrlText(value);
  if (decoded === null) return null;

  try {
    const parsed: unknown = JSON.parse(decoded);
    return isJsonValue(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
