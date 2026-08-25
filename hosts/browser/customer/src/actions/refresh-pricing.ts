'use server';

import { refresh, revalidateTag } from 'next/cache';

export async function refreshPricing(): Promise<void> {
  revalidateTag('pricing', 'max');
  refresh();
}
