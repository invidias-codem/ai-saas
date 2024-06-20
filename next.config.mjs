/** @type {import('next').NextConfig} */
const nextConfig = {
  // Define environment variables
  env: {
    API_KEY: process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY, // Allow public or private key
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN || undefined, // Allow public or private key
  },
  // Image optimization for api.openai.com domain
  images: {
    domains: [""],
  },
  // Audio optimization for api.replicate.com domain
  // Optional error handling (check for missing API keys)
};

export default nextConfig;

  
