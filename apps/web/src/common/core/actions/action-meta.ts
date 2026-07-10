export type ActionRail = 'query' | 'command' | 'render' | 'global';

export type ActionCriticality = 'low' | 'medium' | 'high';

export type ActionMeta = Readonly<{
  action: string;
  rail: ActionRail;
  criticality: ActionCriticality;
  source?: string;
  productCritical?: boolean;
}>;
