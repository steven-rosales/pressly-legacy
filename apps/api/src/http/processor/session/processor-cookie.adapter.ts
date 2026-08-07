import type { Response } from 'express';
import type { ProcessorSessionOptions } from './processor-session.port.ts';

export type ProcessorCookieNames = Readonly<{
  session: string;
  mfa: string;
}>;

export const processorCookieNames = (
  secureCookies: boolean,
): ProcessorCookieNames =>
  secureCookies
    ? {
        session: '__Host-pressly-processor-session',
        mfa: '__Host-pressly-processor-mfa',
      }
    : {
        session: 'pressly_processor_session',
        mfa: 'pressly_processor_mfa',
      };

export const readProcessorCookie = (
  header: string | undefined,
  name: string,
): string | null => {
  if (header === undefined) return null;

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() !== name) continue;

    const value = pair.slice(separator + 1).trim();
    if (value.length === 0) return null;

    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }

  return null;
};

const cookieOptions = (options: ProcessorSessionOptions) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: options.secureCookies,
  path: '/',
});

export const setProcessorCookie = (
  response: Response,
  name: string,
  value: string,
  expiresAt: Date,
  options: ProcessorSessionOptions,
): void => {
  response.cookie(name, value, {
    ...cookieOptions(options),
    expires: expiresAt,
  });
};

export const clearProcessorCookie = (
  response: Response,
  name: string,
  options: ProcessorSessionOptions,
): void => {
  response.clearCookie(name, cookieOptions(options));
};
