import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Turbopack alias (Next.js 16 default bundler)
  turbopack: {
    resolveAlias: {
      exceljs: "exceljs/dist/exceljs.bare.min.js",
    },
  },
  // Webpack alias (fallback / production builds)
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.alias = {
        ...config.resolve.alias,
        exceljs: "exceljs/dist/exceljs.bare.min.js",
      };
    }
    return config;
  },
};

export default nextConfig;
