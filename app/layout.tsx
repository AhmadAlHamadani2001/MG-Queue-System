import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "MG Queue System",
  description: "Real-time queue management for MG after-sales service centers",
  // Lets iPhone customers add the tracking page to the Home Screen as a
  // full-screen app — required on iOS for lock-screen push alerts.
  appleWebApp: {
    capable: true,
    title: "MG Queue",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#E20613",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
