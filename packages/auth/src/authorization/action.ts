export type Action =
  | 'auth:login'
  | 'auth:logout'
  | 'auth:session:read'
  | 'auth:session:revoke'
  | 'auth:user:manage'
  | 'pricing:read'
  | 'pricing:plan'
  | 'pricing:publish'
  | 'pricing:rollback';
