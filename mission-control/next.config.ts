import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactStrictMode: false, // Disable to prevent double-mounting effects in dev
  
  // Exclude Node.js-only packages from Turbopack bundling
  // snowflake-sdk contains non-ESM code that can't be bundled for the browser
  serverExternalPackages: ["snowflake-sdk"],
};

export default nextConfig;
