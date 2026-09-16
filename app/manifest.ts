import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dosthai AI',
    short_name: 'Dosthai',
    description: 'A personal AI workspace for chat, coding, research and creation.',
    start_url: '/',
    display: 'standalone',
    background_color: '#090b10',
    theme_color: '#090b10',
    icons: []
  };
}
