/** @type {import('next').NextConfig} */
const nextConfig = {
  // Define environment variables
  env: {
    API_KEY: process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY, // Allow public or private key
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
  // Image optimization for api.openai.com domain
  images: {
    domains: ["api.openai.com"],
  },
  // Optional error handling (check for missing API keys)
};

export default nextConfig;

  
