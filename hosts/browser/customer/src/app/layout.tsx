import { customerWeb } from '@pressly/topology/browser/customer';
import { Lexend_Deca } from 'next/font/google';
import type { ReactNode } from 'react';
import { WebCoreProvider } from '@/composition/web-core-context';
import '@/styles/globals.css';
import { CustomerBrowserCapabilitiesHost } from '@/composition/customer-browser-capabilities';

const lexend = Lexend_Deca({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-lexend-deca',
  preload: true,
  fallback: ['system-ui', 'arial'],
});

export const metadata = customerWeb.root.metadata;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={lexend.className}>
      <body className="antialiased">
        <CustomerBrowserCapabilitiesHost>
          <WebCoreProvider>
            <customerWeb.root.Content>{children}</customerWeb.root.Content>
          </WebCoreProvider>
        </CustomerBrowserCapabilitiesHost>
      </body>
    </html>
  );
}
