import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

const nextConfig: NextConfig = {
  output: 'export',
  basePath: isProd ? '/vacfa-translate' : '',
  assetPrefix: isProd ? '/vacfa-translate/' : '',
  images: { unoptimized: true },
  trailingSlash: true,
};

export default nextConfig;
