import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  async rewrites() {
    const configuredApiUrl = process.env.API_BASE_URL;
    const apiBaseUrl =
      configuredApiUrl ??
      (process.env.NODE_ENV === 'development' ? 'http://localhost:8080' : undefined);

    if (!apiBaseUrl) return [];

    return [
      {
        source: '/api/:path*',
        destination: `${apiBaseUrl.replace(/\/$/, '')}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
