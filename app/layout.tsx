import './globals.css';
import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import SwKayit from './SwKayit';

export const metadata: Metadata = {
  title: 'Ritos',
  description: 'Günlük ritüeller, kişisel gelişim programları ve paylaşım.',
  applicationName: 'Ritos',
  appleWebApp: { capable: true, title: 'Ritos', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#2c2a24',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>
        {children}
        <SwKayit />
      </body>
    </html>
  );
}
