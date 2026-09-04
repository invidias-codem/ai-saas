import path from 'path';
import createMDX from '@next/mdx';
import createNextIntlPlugin from 'next-intl/plugin';

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
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      'esbuild-wasm': path.resolve('./node_modules/esbuild-wasm'),
    };

    // Prevent Webpack from intercepting import.meta.url resolution so
    // runtime artifacts like onnxruntime-web can use native paths.
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.m?js$/,
      parser: { javascript: { importMeta: false } },
    });

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

export default withMDX(
  withNextIntl({
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
        // Only redirect ROUTES under /blog, never static files under public/blog/.
        // The negative lookahead excludes paths ending in a known asset extension
        // (jpg/png/svg/webp/etc.) so OG cards, card thumbs, and inlined post images
        // resolve from public/blog/ as expected instead of being rewritten to
        // /en/blog/<file> (which is a route lookup and 404s).
        { source: '/blog/:path((?!.*\\.(?:jpe?g|png|gif|webp|svg|ico|xml|txt|json|mp4|webm|woff2?|ttf|otf))[^?]*)', destination: '/en/blog/:path', permanent: false },
        { source: '/support', destination: '/en/support', permanent: false },
        { source: '/support/:path*', destination: '/en/support/:path*', permanent: false },
        { source: '/slack', destination: '/en/slack', permanent: false },
        { source: '/privacy', destination: '/en/privacy', permanent: false },
        { source: '/docs', destination: '/en/docs', permanent: false },
        { source: '/explore', destination: '/en/explore', permanent: false },
      ];
    },
    async headers() {
      const allowedOrigins = [
        'https://gen1e.xyz',
        'https://www.gen1e.xyz',
        'https://clerk.gen1e.xyz',
      ].join(',');

      return [
        {
          // Restrictive CORS for page routes
          source: '/:path*',
          headers: [
            { key: 'X-DNS-Prefetch-Control', value: 'on' },
            { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
            {
              key: 'Content-Security-Policy',
              value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' https://clerk.com https://*.clerk.accounts.dev https://clerk.gen1e.xyz https://apis.google.com https://*.googleapis.com https://va.vercel-scripts.com https://challenges.cloudflare.com https://js.hcaptcha.com https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' blob: data: https://*.clerk.com https://img.clerk.com https://replicate.delivery https://*.replicate.delivery https://*.googleapis.com https://*.gstatic.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co https://storage.ko-fi.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://clerk.com https://*.clerk.accounts.dev https://clerk.gen1e.xyz https://*.clerk.com https://*.googleapis.com https://ozevwhiipwbcvyzkbhib.supabase.co https://*.supabase.co wss://ozevwhiipwbcvyzkbhib.supabase.co wss://*.supabase.co https://clerk-telemetry.com https://challenges.cloudflare.com https://static.cloudflareinsights.com; frame-src 'self' https://ko-fi.com https://challenges.cloudflare.com https://newassets.hcaptcha.com; worker-src 'self' blob:;"
            },
            { key: 'X-XSS-Protection', value: '1; mode=block' },
            { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
            { key: 'X-Content-Type-Options', value: 'nosniff' },
            { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
            { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
            { key: 'Access-Control-Allow-Origin', value: allowedOrigins },
            { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
            { key: 'Access-Control-Max-Age', value: '86400' },
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' }
          ]
        },
        {
          // API routes: CORS restricted, credentials-aware
          source: '/api/:path*',
          headers: [
            { key: 'Access-Control-Allow-Origin', value: 'https://gen1e.xyz' },
            { key: 'Access-Control-Allow-Methods', value: 'GET, POST, OPTIONS' },
            { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Requested-With' },
            { key: 'Access-Control-Max-Age', value: '86400' },
            { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
            { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' }
          ]
        },
        {
          // Partner API (v1): tighter CORS — no browser origins
          source: '/api/v1/:path*',
          headers: [
            { key: 'Access-Control-Allow-Origin', value: 'https://gen1e.xyz' },
            { key: 'Access-Control-Allow-Methods', value: 'POST, GET' },
            { key: 'Access-Control-Allow-Headers', value: 'Authorization, Content-Type' },
            { key: 'Access-Control-Max-Age', value: '3600' },
          ]
        }
      ];
    },
  })
);
