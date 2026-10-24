import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // D-016 (server-mediated upload): the product cap on medical documents is
  // 4 MiB, and the server-action body must clear Vercel's hard ~4.5 MB ceiling
  // (file + fields). Next's own Server Action body limit is raised to match
  // the infra ceiling; the document cap itself is enforced by Zod (4 MiB), the
  // bucket (0007) and the DB CHECK (0008).
  experimental: {
    serverActions: {
      bodySizeLimit: "4.5mb",
    },
  },
  // /verify URLs carry the pass credential and the response carries holder PII:
  // keep them out of shared caches, search indexes, and cross-origin referrers.
  async headers() {
    return [
      {
        source: "/verify",
        headers: [
          { key: "Cache-Control", value: "no-store" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      },
    ];
  },
};

export default nextConfig;
