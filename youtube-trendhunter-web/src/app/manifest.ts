import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TrendHunter - Veille YouTube IA",
    short_name: "TrendHunter",
    description: "Détectez les tendances YouTube émergentes avant vos concurrents",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#0a0a0a",
    theme_color: "#ff0000",
    orientation: "portrait-primary",
    categories: ["productivity", "utilities"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "48x48",
        type: "image/x-icon",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
