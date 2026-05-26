export type Resource =
  | 'auth_identity'
  | 'auth_session'
  | 'pricing_catalog'
  | (string & {});
