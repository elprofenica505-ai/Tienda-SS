import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ConexiaX',
    short_name: 'ConexiaX',
    description: 'Operaciones claras para negocios ambiciosos.',
    start_url: '/login',
    display: 'standalone',
    background_color: '#f7fbf4',
    theme_color: '#071c13',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
    lang: 'es',
  };
}
