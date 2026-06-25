import path from 'path';
import createMDX from '@next/mdx';
import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';

const projectRoot = path.resolve('./');
const isTauri = process.env.TAURI_BUILD === 'true';

const isVercel = Boolean(process.env.VERCEL);

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: isTauri ? 'export' : isVercel ? undefined : 'standalone',
  // Enable MDX pages
  pageExtensions: ['js', 'jsx', 'mdx', 'ts', 'tsx'],

  images: {
    unoptimized: isTauri,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'replicate.delivery',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.replicate.delivery',
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

  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },

  // Required for Turbopack to properly resolve dependencies
  // These packages are ESM/CommonJS hybrids that Turbopack can't resolve without explicit transpilation
  transpilePackages: [
    'recharts',
    'react-is',
    'pdfjs-dist',
    'mammoth',
    'pdf-parse',
    'xlsx',
    'file-type'
  ],
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
      'functions/**',
      'anycrawl/**',
      'remote/**',
      'packages/ucol-node/**',
      'go-harness/**',
      'scripts/lattice-cli/venv/**',
      '**/node_modules/.bin/**',
      '**/.bin/**',
    ],
  },
  // outputFileTracingIncludes removed to prevent pnpm symlink packaging errors
  experimental: {},
  webpack: (config, { isServer }) => {
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
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    };
    return config;
  },
};

const withMDX = createMDX({
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

const withNextIntl = createNextIntlPlugin('./i18n.ts');

export default withSentryConfig(
  withMDX(withNextIntl({
    ...nextConfig,
    async redirects() {
    return [
      { source: '/dashboard', destination: '/en/dashboard', permanent: false },
      { source: '/dashboard/:path*', destination: '/en/dashboard/:path*', permanent: false },
      { source: '/conversation', destination: '/en/conversation', permanent: false },
      { source: '/conversation/:path*', destination: '/en/conversation/:path*', permanent: false },
      { source: '/code/builder', destination: '/en/code/builder', permanent: false },
      { source: '/code', destination: '/en/code', permanent: false },
      { source: '/code/:path*', destination: '/en/code/:path*', permanent: false },
      { source: '/image', destination: '/en/image', permanent: false },
      { source: '/image/:path*', destination: '/en/image/:path*', permanent: false },
      { source: '/video', destination: '/en/video', permanent: false },
      { source: '/video/:path*', destination: '/en/video/:path*', permanent: false },
      { source: '/music', destination: '/en/music', permanent: false },
      { source: '/music/:path*', destination: '/en/music/:path*', permanent: false },
      { source: '/settings', destination: '/en/settings', permanent: false },
      { source: '/settings/:path*', destination: '/en/settings/:path*', permanent: false },
      { source: '/blog', destination: '/en/blog', permanent: false },
      { source: '/blog/:path*', destination: '/en/blog/:path*', permanent: false },
      { source: '/support', destination: '/en/support', permanent: false },
      { source: '/support/:path*', destination: '/en/support/:path*', permanent: false },
      { source: '/slack', destination: '/en/slack', permanent: false },
      { source: '/privacy', destination: '/en/privacy', permanent: false },
      { source: '/docs', destination: '/en/docs', permanent: false },
    ];
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://clerk.gen1e.xyz https://apis.google.com https://*.googleapis.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://js.hcaptcha.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://*.clerk.com https://img.clerk.com https://replicate.delivery https://*.replicate.delivery https://*.googleapis.com https://*.gstatic.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co https://storage.ko-fi.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://clerk.com https://*.clerk.accounts.dev https://clerk.gen1e.xyz https://*.clerk.com https://*.googleapis.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co wss://ozevwhiipwbcvyzkbhib.supabase.co wss://*.supabase.co https://clerk-telemetry.com https://challenges.cloudflare.com; frame-src 'self' https://ko-fi.com https://challenges.cloudflare.com https://newassets.hcaptcha.com; worker-src 'self' blob:;"
          },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' }
        ]
      }
    ];
  },
})));
