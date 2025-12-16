/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Enable React strict mode for better development experience
  reactStrictMode: true,
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      // Force singletons for Yjs stack to avoid duplicate imports warning
      yjs: require.resolve('yjs'),
      'y-protocols': require.resolve('y-protocols'),
      lib0: require.resolve('lib0'),
    };
    return config;
  },
  async rewrites() {
    const backendBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
    return [
      {
        source: '/api/v1/:path*',
        destination: `${backendBase}/api/v1/:path*`,
      },
      {
        source: '/health',
        destination: `${backendBase}/health`,
      },
    ]
  },
}

module.exports = nextConfig 
