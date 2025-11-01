/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Enable React strict mode for better development experience
  reactStrictMode: true,
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