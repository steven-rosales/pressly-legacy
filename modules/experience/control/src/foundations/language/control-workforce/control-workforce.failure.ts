export type ControlWorkforceRejection = Readonly<{
  kind: 'workforce_rejected';
  category:
    | 'validation'
    | 'authentication'
    | 'permission'
    | 'not_found'
    | 'conflict'
    | 'rate_limit';
  code: string;
  message: string;
  details?: Readonly<{
    currentVersion?: number;
    violations?: readonly string[];
  }>;
}>;
