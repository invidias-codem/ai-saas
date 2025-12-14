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
};

const withMDX = createMDX({
  // Add markdown plugins here if needed
  options: {
    remarkPlugins: [],
    rehypePlugins: [],
  },
});

// Merge MDX config with Next.js config
export default withMDX(nextConfig);
