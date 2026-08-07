import { isJsonValue, type JsonValue } from './json-value.ts';

export const encodeBase64UrlText = (value: string): string => {
  let binary = '';
  for (const byte of new TextEncoder().encode(value))
    binary += String.fromCharCode(byte);

  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
};

export const decodeBase64UrlText = (value: string): string | null => {
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const binary = atob(`${base64}${padding}`);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    return new TextDecoder().decode(bytes);
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
