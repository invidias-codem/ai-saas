import createMDX from '@next/mdx';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Enable MDX pages
  pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'scoutforge.net',
        port: '',
        pathname: '/**',
      },
    ],
  },
  serverExternalPackages: [
    '@google-cloud/tasks',
    '@google-cloud/storage',
    '@google-cloud/vertexai',
    '@google-cloud/aiplatform',
    'google-gax',
    'grpc'
  ],
  outputFileTracingIncludes: {
    '/api/**/*': [
      'node_modules/@google-cloud/tasks/build/esm/src/**/*.json',
      'node_modules/google-gax/build/src/**/*.json'
    ]
  },
  experimental: {},
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js", ".jsx"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };
    return config;
  },
};

const withMDX = createMDX({
  // Add markdown plugins here if needed
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

// Merge MDX config with Next.js config
export default withMDX({
  ...nextConfig,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on'
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload'
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://apis.google.com https://*.googleapis.com https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://*.clerk.com https://img.clerk.com https://replicate.delivery https://*.googleapis.com https://*.gstatic.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co https://storage.ko-fi.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://clerk.com https://*.clerk.accounts.dev https://*.googleapis.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co wss://ozevwhiipwbcvyzkbhib.supabase.co wss://*.supabase.co https://clerk-telemetry.com; frame-src 'self' https://ko-fi.com; worker-src 'self' blob:;"
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block'
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN'
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff'
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin'
          }
        ]
      }
    ];
  },
});
