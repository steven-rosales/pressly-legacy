export type WebContext = Readonly<{
  source: 'web';
  route: string;
  sessionId: string;
  distinctId: string;
}>;

export type ContextProvider<C> = Readonly<{ get: () => C }>;
