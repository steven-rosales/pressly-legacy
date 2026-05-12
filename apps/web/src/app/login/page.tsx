import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CENTS_ORDER_URL } from '@/app/(marketing)/shared/marketing/content';
import { NOINDEX_ROBOTS } from '@/app/(marketing)/shared/marketing/seo';

export const metadata: Metadata = {
  robots: NOINDEX_ROBOTS,
};

export default function LoginRedirectPage() {
  redirect(CENTS_ORDER_URL);
}
