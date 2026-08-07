import type { ControlAccess } from '../control-access/control-access.model.ts';

export type ControlActor = Readonly<{
  identityId: string;
  sessionId: string;
}>;

export type ControlCommandContext = Readonly<{
  origin: 'pressly_control';
  principal: Readonly<{
    kind: 'human' | 'service' | 'system';
    id: string;
  }>;
}>;

export type ControlRequestContext = Readonly<{
  access: ControlAccess;
  actor: ControlActor;
  command: ControlCommandContext;
}>;
