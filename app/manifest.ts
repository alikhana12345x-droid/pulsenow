import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PulseNow",
    short_name: "PulseNow",
    description: "Provably Fair · Instant Withdrawals · 1% House Edge.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#090714",
    theme_color: "#090714",
    orientation: "portrait",
    categories: ["games", "entertainment"],
    icons: [
      {
        src: "/brand/fav-icons/favicon-16x16.png",
        sizes: "16x16",
        type: "image/png",
      },
      {
        src: "/brand/fav-icons/favicon-32x32.png",
        sizes: "32x32",
        type: "image/png",
      },
      {
        src: "/brand/fav-icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
      {
        src: "/brand/fav-icons/android-chrome-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/brand/fav-icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
      {
        src: "/brand/fav-icons/android-chrome-512x512.png",
        sizes: "512x512",
        type: "image/png",
        // @ts-ignore — Next.js types omit `purpose` but the field is valid per W3C spec
        purpose: "maskable",
      },
    ],
  };
}
