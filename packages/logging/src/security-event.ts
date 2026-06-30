export type SecurityEventName =
  | 'authentication.login_succeeded'
  | 'authentication.login_failed'
  | 'authentication.login_rate_limited'
  | 'authorization.denied'
  | 'request.validation_rejected'
  | 'request.rate_limited'
  | 'session.revoked'
  | 'session.revoked_all'
  | 'privileged.mutation'
  | 'server.error'
  | 'mfa.enrolled'
  | 'mfa.challenge_failed'
  | 'mfa.recovery_used'
  | 'deployment.succeeded'
  | 'deployment.failed';

export type SecurityEvent = Readonly<{
  name: SecurityEventName;
  occurredAt: string;
  outcome: 'succeeded' | 'denied' | 'failed';
  requestId?: string;
  principalId?: string;
  sessionId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  reason?: string;
}>;

export type SecurityEventSink = Readonly<{
  emit: (event: SecurityEvent) => void;
}>;

export const nullSecurityEventSink: SecurityEventSink = {
  emit: () => undefined,
};
