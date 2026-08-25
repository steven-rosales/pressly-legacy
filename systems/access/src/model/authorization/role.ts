export type Role = 'owner' | 'manager' | 'operator';

export const isRole = (value: unknown): value is Role =>
  value === 'owner' || value === 'manager' || value === 'operator';
