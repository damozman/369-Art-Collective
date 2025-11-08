// next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Force fresh build
  generateBuildId: async () => {
    return 'build-' + Date.now();
  },
};

export default nextConfig;