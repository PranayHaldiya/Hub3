import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '../providers/providers';

export const metadata = {
  title: 'Hub3 | OWS-Powered Code Asset Protocol',
  description: 'Hub3 lets users and agents publish, unlock, verify, and refresh repositories with Irys provenance, x402 payments, and OWS-backed wallet controls.'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="page-shell">{children}</div>
        </Providers>
      </body>
    </html>
  );
}
