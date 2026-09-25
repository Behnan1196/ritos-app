import './globals.css';
import type { ReactNode } from 'react';
import type { Viewport } from 'next';

export const metadata = {
  title: 'Ritos — yerleşim laboratuvarı',
  description: 'Ritos ekran yerleşimi denemesi (rite-app veri modeline bağlı değil).',
};

export const viewport: Viewport = {
  themeColor: '#2c2a24',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
