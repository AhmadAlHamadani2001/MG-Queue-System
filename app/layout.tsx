import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MG Queue System",
  description: "Real-time queue management for MG after-sales service centers",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
