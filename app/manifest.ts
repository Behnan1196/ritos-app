import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Ritos',
    short_name: 'Ritos',
    description: 'Günlük ritüeller, kişisel gelişim programları ve paylaşım.',
    lang: 'tr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f4efe6',
    theme_color: '#2c2a24',
    icons: [
      { src: '/ikon/192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/ikon/512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/ikon/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
