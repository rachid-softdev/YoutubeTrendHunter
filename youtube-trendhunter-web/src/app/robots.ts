import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/dashboard", "/settings", "/billing", "/alerts", "/niches/", "/api/"],
      },
      {
        userAgent: "GPTBot",
        disallow: "/",
      },
    ],
    sitemap: `${process.env.NEXTAUTH_URL || "https://trendhunter.app"}/sitemap.xml`,
  };
}
