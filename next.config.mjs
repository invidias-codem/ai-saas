import createMDX from '@next/mdx';
import createNextIntlPlugin from 'next-intl/plugin';

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
  // Required for Turbopack to properly resolve recharts dependencies
  transpilePackages: ['recharts', 'react-is'],
  serverExternalPackages: [
    '@google-cloud/tasks',
    '@google-cloud/storage',
    '@google-cloud/vertexai',
    '@google-cloud/aiplatform',
    'google-gax',
    'grpc'
  ],
  outputFileTracingExcludes: {
    '**': [
      '.agent/**',
      '.agent/skills/**',
      'functions/**/venv/**',
      'functions/**/__pycache__/**',
      'anycrawl/**',
    ],
  },
  outputFileTracingIncludes: {
    '/api/**/*': [
      'node_modules/@google-cloud/tasks/build/esm/src/**/*.json',
      'node_modules/google-gax/build/src/**/*.json'
    ]
  },
  experimental: {},
  webpack: (config, { isServer }) => {
    // Exclude .agent paths from module resolution (these are runtime scripts, not imports)
    if (isServer) {
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push(({ request }, callback) => {
          if (request && request.includes('.agent/')) {
            return callback(null, 'commonjs ' + request);
          }
          callback();
        });
      }
    }
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

const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Merge MDX config with Next.js config
export default withMDX(withNextIntl({
  ...nextConfig,
  async redirects() {
    return [
      // ── Non-locale routes → /en/* (permanent 308) ───────────────────────────
      // These were returning 404 because next-intl requires a locale prefix.
      // Using permanent: false (307) so we can change the default locale later
      // without being stuck in cached redirects.
      {
        source: '/dashboard',
        destination: '/en/dashboard',
        permanent: false,
      },
      {
        source: '/dashboard/:path*',
        destination: '/en/dashboard/:path*',
        permanent: false,
      },
      {
        source: '/blog',
        destination: '/en/blog',
        permanent: false,
      },
      {
        source: '/blog/:path*',
        destination: '/en/blog/:path*',
        permanent: false,
      },
      {
        source: '/support',
        destination: '/en/support',
        permanent: false,
      },
      {
        source: '/support/:path*',
        destination: '/en/support/:path*',
        permanent: false,
      },
      {
        source: '/slack',
        destination: '/en/slack',
        permanent: false,
      },
      {
        source: '/settings',
        destination: '/en/settings',
        permanent: false,
      },
      {
        source: '/settings/:path*',
        destination: '/en/settings/:path*',
        permanent: false,
      },
      {
        source: '/conversation/:path*',
        destination: '/en/conversation/:path*',
        permanent: false,
      },
    ];
  },
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
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://clerk.gen1e.xyz https://apis.google.com https://*.googleapis.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://js.hcaptcha.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://*.clerk.com https://img.clerk.com https://replicate.delivery https://*.googleapis.com https://*.gstatic.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co https://storage.ko-fi.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://clerk.com https://*.clerk.accounts.dev https://clerk.gen1e.xyz https://*.clerk.com https://*.googleapis.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co wss://ozevwhiipwbcvyzkbhib.supabase.co wss://*.supabase.co https://clerk-telemetry.com https://challenges.cloudflare.com; frame-src 'self' https://ko-fi.com https://challenges.cloudflare.com https://newassets.hcaptcha.com; worker-src 'self' blob:;"
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
}));
