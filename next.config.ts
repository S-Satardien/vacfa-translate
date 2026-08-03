import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: process.env.NODE_ENV === 'production' ? '/vacfa-translate' : '',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
