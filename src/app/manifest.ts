import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Tempo — Your day, together",
    short_name: "Tempo",
    description: "Your personal planner, routines, food diary, and Tempo assistant in one place.",
    start_url: "/workspace",
    scope: "/",
    display: "standalone",
    background_color: "#f7f5ef",
    theme_color: "#354f42",
    lang: "en",
    icons: [
      { src: "/images/tempo-icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/images/tempo-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
