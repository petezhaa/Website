import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "a.ltrbxd.com", pathname: "/resized/**" }, // letterboxd posters
      { protocol: "https", hostname: "cdn.cloudflare.steamstatic.com", pathname: "/steam/apps/**" }, // steam capsules
    ],
  },
};

export default nextConfig;
