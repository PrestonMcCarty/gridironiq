/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow fetching from Sleeper, FantasyCalc, and corsproxy
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },

  webpack(config) {
    config.optimization.concatenateModules = false;
    return config;
  },
};

module.exports = nextConfig;
