import type { Response } from 'express';

export type ReadOrderManagementPrincipal = (response: Response) => Readonly<{
  identityId: string;
  kind: 'human' | 'service';
}>;

export const orderManagementCommandContext = (
  response: Response,
  readPrincipal: ReadOrderManagementPrincipal,
) => {
  const principal = readPrincipal(response);
  return {
    origin: 'pressly_processor',
    principal: { kind: principal.kind, id: principal.identityId },
  } as const;
};
