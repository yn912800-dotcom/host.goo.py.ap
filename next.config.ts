import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Needed so /apps/<id>/ keeps its trailing slash (relative asset URLs of hosted sites).
  skipTrailingSlashRedirect: true,
  async headers() {
    return [
      {
        source: "/((?!apps/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
