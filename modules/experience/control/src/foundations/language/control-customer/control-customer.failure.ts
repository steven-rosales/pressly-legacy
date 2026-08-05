export type ControlCustomerRejection = Readonly<{
  kind: 'customer_rejected';
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
