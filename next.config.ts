import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compression
  compress: true,

  // Images
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
    ],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  // Headers de sécurité
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        source: "/api/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate",
          },
        ],
      },
      {
        source: "/(.*).(js|css|woff|woff2|ttf|eot|svg|ico|jpg|jpeg|png|webp|avif|json)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },

  // Redirects
  async redirects() {
    return [
      {
        source: "/features",
        destination: "/pricing",
        permanent: true,
      },
    ];
  },

  // Experimental features
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ["lucide-react", "@radix-ui/react"],
  },

  // TypeScript
  typescript: {
    ignoreBuildErrors: process.env.NODE_ENV === "production" ? false : true,
  },

  // Generate Etags
  generateEtags: true,

  // Powered by header
  poweredByHeader: false,
};

export default nextConfig;
