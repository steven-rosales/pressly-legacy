import type { Response } from 'express';
import type { ControlSessionOptions } from './control-session.port.ts';

export type ControlCookieNames = Readonly<{
  session: string;
  mfa: string;
}>;

export const controlCookieNames = (
  secureCookies: boolean,
): ControlCookieNames =>
  secureCookies
    ? {
        session: '__Host-pressly-control-session',
        mfa: '__Host-pressly-control-mfa',
      }
    : {
        session: 'pressly_control_session',
        mfa: 'pressly_control_mfa',
      };

export const readControlCookie = (
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

const cookieOptions = (options: ControlSessionOptions) => ({
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: options.secureCookies,
  path: '/',
});

export const setControlCookie = (
  response: Response,
  name: string,
  value: string,
  expiresAt: string,
  options: ControlSessionOptions,
): void => {
  response.cookie(name, value, {
    ...cookieOptions(options),
    expires: new Date(expiresAt),
  });
};

export const clearControlCookie = (
  response: Response,
  name: string,
  options: ControlSessionOptions,
): void => {
  response.clearCookie(name, cookieOptions(options));
};
