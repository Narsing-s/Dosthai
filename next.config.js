/** @type {import('next').NextConfig} */
const isGitHubPages = process.env.GITHUB_PAGES === 'true';
const githubBasePath = isGitHubPages ? '/Dosthai' : '';

const nextConfig = {
  poweredByHeader: false,
  ...(isGitHubPages ? {
    output: 'export',
    basePath: githubBasePath,
    assetPrefix: `${githubBasePath}/`,
    trailingSlash: true,
  } : {
    async headers() {
      return [{
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), geolocation=(), payment=()' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' }
        ]
      }];
    }
  })
};

module.exports = nextConfig;
