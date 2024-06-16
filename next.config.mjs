/** @type {import('next').NextConfig} */
const nextConfig = {
  // Define environment variables
  env: {
    API_KEY: process.env.API_KEY || process.env.NEXT_PUBLIC_API_KEY, // Allow public or private key
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN, 
  },
  // Image optimization for api.openai.com domain
  images: {
    domains: [""],
  },
  audio: {
    domains: ["https://api.replicate.com", "https://replicate.delivery/pbxt/SCiO1SBkqj7gL5c0zSb5I8f5B9dXx0jvSsXwJg6Z3fj/"],
    
  },
  // Optional error handling (check for missing API keys)
};

export default nextConfig;

  
