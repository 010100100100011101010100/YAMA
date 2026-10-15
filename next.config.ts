import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  serverExternalPackages: ["falkordb", "@redis/client"],
  turbopack: { root: import.meta.dirname },
};

export default nextConfig;
