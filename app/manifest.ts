import type { MetadataRoute } from 'next';

const basePath = process.env.GITHUB_PAGES === 'true' ? '/Dosthai' : '';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Dosthai AI',
    short_name: 'Dosthai',
    description: 'A personal AI workspace for chat, coding, research and creation.',
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#090b10',
    theme_color: '#090b10',
    icons: [
      {
        src: `${basePath}/icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: `${basePath}/icon.svg`,
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable'
      }
    ]
  };
}
