import { Secret, TOTP } from 'otpauth';

const periodSeconds = 30;

export type TotpVerification = Readonly<{
  valid: boolean;
  counter?: number;
}>;

export type TotpAuthenticator = Readonly<{
  generateSecret: () => string;
  enrollmentUri: (input: {
    secret: string;
    issuer: string;
    label: string;
  }) => string;
  verify: (input: {
    secret: string;
    token: string;
    now: Date;
  }) => TotpVerification;
}>;

export const makeTotpAuthenticator = (): TotpAuthenticator => ({
  generateSecret: () => new Secret({ size: 20 }).base32,

  enrollmentUri: ({ secret, issuer, label }) =>
    new TOTP({
      issuer,
      label,
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: periodSeconds,
    }).toString(),

  verify: ({ secret, token, now }) => {
    if (!/^\d{6}$/.test(token)) return { valid: false };

    const timestamp = now.getTime();
    const delta = TOTP.validate({
      token,
      secret: Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: periodSeconds,
      timestamp,
      window: 1,
    });

    if (delta === null) return { valid: false };

    return {
      valid: true,
      counter: TOTP.counter({ period: periodSeconds, timestamp }) + delta,
    };
  },
});
