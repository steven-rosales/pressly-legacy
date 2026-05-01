export type ActionRail = 'query' | 'command' | 'render' | 'global';

export type ActionCriticality = 'low' | 'medium' | 'high';

export type ActionMeta = Readonly<{
  action: string;
  rail: ActionRail;
  criticality: ActionCriticality;
  source?: string;
}>;

export type CommandFeedback = Readonly<{
  loading?: string;
  success?: string;
  error?: string;
}>;
