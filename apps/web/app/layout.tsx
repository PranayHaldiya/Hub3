import type { ReactNode } from 'react';
import './globals.css';
import { Providers } from '../providers/providers';

export const metadata = {
  title: 'Hub3',
  description: 'Publish public GitHub repositories to Irys and register provenance on Solana.'
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