export type CommandPrincipal = Readonly<{
  id: string;
  kind: 'human' | 'service' | 'system';
}>;

export type CommandContext = Readonly<{
  origin: string;
  principal: CommandPrincipal;
}>;

export const isCommandContextValid = (context: CommandContext): boolean =>
  context.origin.trim() !== '' && context.principal.id.trim() !== '';
