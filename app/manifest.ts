import type { MetadataRoute } from "next";

// Web app manifest. iOS (16.4+) only allows Web Push — lock-screen
// notifications — for sites the customer has added to the Home Screen,
// and only when the manifest says display: "standalone".
//
// start_url is left out on purpose: the browser then uses the page the
// customer was on when they tapped "Add to Home Screen", so the icon
// reopens their own ticket (/t/<id>) instead of the generic home page.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MG Queue",
    short_name: "MG Queue",
    description: "Live queue tracking for MG after-sales service centers",
    display: "standalone",
    scope: "/",
    background_color: "#F7F5F0",
    theme_color: "#E20613",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
