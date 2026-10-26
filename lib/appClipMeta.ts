import type { Metadata } from "next";

// Safari Smart App Banner for the iPhone App Clip: an iPhone visitor
// who opens a ticket/branch link in Safari gets the one-tap App Clip
// card. Only rendered once the App Store app exists — set
// NEXT_PUBLIC_IOS_APP_ID (numeric App Store ID) and APNS_CLIP_BUNDLE_ID
// in Vercel.
export function appClipMetadata(): Metadata {
  const appId = process.env.NEXT_PUBLIC_IOS_APP_ID;
  const clipId = process.env.APNS_CLIP_BUNDLE_ID;
  if (!appId || !clipId) return {};
  return {
    other: {
      "apple-itunes-app": `app-id=${appId}, app-clip-bundle-id=${clipId}, app-clip-display=card`,
    },
  };
}
