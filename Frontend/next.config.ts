import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Allow dynamic imports that Next.js can't statically analyze
  // This is needed for Monaco Editor's worker loading
  experimental: {
    esmExternals: 'loose',
  },
  async rewrites() {
    const pythonBackend = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
    const fileSystemBackend = process.env.NEXT_PUBLIC_FILE_SYSTEM_URL || 'http://localhost:3001';
    
    return [
      // File system endpoints (SBackend - Node.js server on port 3001)
      {
        source: '/api/projects/:projectId/files/:path*',
        destination: `${fileSystemBackend}/api/projects/:projectId/files/:path*`,
      },
      {
        source: '/api/projects/:projectId/folders/:path*',
        destination: `${fileSystemBackend}/api/projects/:projectId/folders/:path*`,
      },
      {
        source: '/api/projects/:projectId/items/:path*',
        destination: `${fileSystemBackend}/api/projects/:projectId/items/:path*`,
      },
      {
        source: '/api/projects/:projectId/search',
        destination: `${fileSystemBackend}/api/projects/:projectId/search`,
      },
      {
        source: '/api/projects/:projectId/metadata',
        destination: `${fileSystemBackend}/api/projects/:projectId/metadata`,
      },
      {
        source: '/api/projects/:projectId/initialize',
        destination: `${fileSystemBackend}/api/projects/:projectId/initialize`,
      },
      {
        source: '/api/projects/:projectId/copy',
        destination: `${fileSystemBackend}/api/projects/:projectId/copy`,
      },
      {
        source: '/api/projects/:projectId/move',
        destination: `${fileSystemBackend}/api/projects/:projectId/move`,
      },
      // Database/API endpoints (Python Backend on port 8000)
      {
        source: '/api/v1/:path*',
        destination: `${pythonBackend}/api/v1/:path*`,
      },
      {
        source: '/health',
        destination: `${pythonBackend}/health`,
      },
    ];
  },
  webpack: (config, { isServer }) => {
    // Monaco Editor webpack configuration
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
        crypto: false,
      };
    }

    // Ignore Monaco Editor's dynamic import warnings/errors
    // These are expected and handled at runtime via CDN workers configured in monaco-config.ts
    config.ignoreWarnings = [
      ...(config.ignoreWarnings || []),
      {
        module: /monaco-editor/,
      },
      {
        file: /monaco-editor/,
      },
      /Failed to parse source map/,
      {
        message: /Can't resolve '<dynamic>'/,
      },
      {
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    // Configure webpack to handle Monaco's dynamic imports gracefully
    // This prevents build failures from dynamic imports in Monaco Editor
    config.module = {
      ...config.module,
      unknownContextCritical: false,
      unknownContextRegExp: /^\.\/.*$/,
      unknownContextRequest: '.',
      exprContextCritical: false,
      exprContextRegExp: /^\.\/.*$/,
      exprContextRequest: '.',
    };

    return config;
  },
};

export default nextConfig;
