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
    // Webpack's module concatenation (scope hoisting) can produce TDZ errors
    // when merged modules have an initialization order dependency.
    // Disabling it trades a marginal bundle-size increase for stability.
    config.optimization.concatenateModules = false;
    return config;
  },
};

module.exports = nextConfig;
