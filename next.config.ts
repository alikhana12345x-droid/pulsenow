import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is only wanted when deploying by uploading a build
  // (cPanel/Passenger, a bare VPS). Platforms that build from the repo —
  // Render, Vercel — run `next start` against a normal build, so this stays
  // off unless BUILD_STANDALONE is set. `npm run deploy:build` sets it.
  output: process.env.BUILD_STANDALONE === "true" ? "standalone" : undefined,
  images: {
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // Unlisted round monitor (app/x/[slug]). Kept out of search indexes at
        // the header level too, so a crawler that never executes the page still
        // sees the directive. Deliberately NOT in robots.txt — listing it there
        // would publish the path we're trying to keep unlisted.
        source: "/x/:slug*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      },
    ];
  },
};

export default nextConfig;
