/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };
    return config;
  },
  images: {
    domains: ['arweave.net', 'shdw-drive.genesysgo.net'],
  },
  experimental: {
    appDir: true,
  },
};

module.exports = nextConfig;