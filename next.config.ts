import type { NextConfig } from "next";
import os from "node:os";
import path from "node:path";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      /* KEEP: proofs submitted before the S3 migration still live in Supabase Storage
         and are rendered from these public URLs. Removing this breaks every existing
         deliverable proof. */
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      /* Presigned S3 GET URLs for deliverable proofs. `search` is deliberately omitted:
         Next only compares the query string when `search` is defined, so the ?X-Amz-*
         signature params pass the match. The bucket name must contain no dots for the
         single-label wildcard to apply. */
      {
        protocol: "https",
        hostname: "*.s3.us-east-1.amazonaws.com",
        pathname: "/deals/**",
      },
    ],
    minimumCacheTTL: 3600,
  },

  /* This project lives inside a Dropbox folder, and Dropbox syncing webpack's
     filesystem cache locks its pack files mid-write. That wedges the dev server
     in a nasty way: it keeps returning 200 for the document while main-app.js
     and layout.css 404, so the page renders with no JavaScript — every scroll
     animation silently does nothing. Keeping the cache out of the synced tree
     avoids it. Dev only; production builds are unaffected. */
  webpack: (config, { dev }) => {
    if (dev && config.cache && typeof config.cache === "object") {
      config.cache.cacheDirectory = path.join(os.tmpdir(), "connectnil-webpack-cache");
    }
    return config;
  },
};

export default nextConfig;
