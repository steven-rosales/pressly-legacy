export type Action =
  | 'auth:login'
  | 'auth:logout'
  | 'auth:session:read'
  | 'auth:session:revoke'
  | 'auth:user:manage'
  | 'auth:mfa:enroll'
  | 'auth:mfa:manage'
  | 'pricing:read'
  | 'pricing:plan'
  | 'pricing:publish'
  | 'pricing:rollback';
