export type AuthEnvironment = Readonly<{
  now: Date;
  sessionAgeMinutes?: number;
  ipAddress?: string;
  userAgent?: string;
}>;
