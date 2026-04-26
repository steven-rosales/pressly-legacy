import { redirect } from 'next/navigation';
import { CENTS_ORDER_URL } from '@/lib/content';

export default function LogoutRedirectPage() {
  redirect(CENTS_ORDER_URL);
}
