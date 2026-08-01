export type Role =
  | 'owner'
  | 'manager'
  | 'admin'
  | 'operator'
  | 'customer'
  | 'driver'
  | 'service'
  | 'developer'
  | 'ci';

export const isRole = (value: unknown): value is Role =>
  value === 'owner' ||
  value === 'manager' ||
  value === 'admin' ||
  value === 'operator' ||
  value === 'customer' ||
  value === 'driver' ||
  value === 'service' ||
  value === 'developer' ||
  value === 'ci';
