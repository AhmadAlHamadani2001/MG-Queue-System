import { NextResponse } from "next/server";

// Apple App Site Association: proves this domain belongs to the iPhone
// app, so branch QR codes / ticket links open the App Clip card.
// Apple fetches it from https://<domain>/.well-known/apple-app-site-association
// (no extension, must be JSON, no redirects).
//
// Env: APNS_TEAM_ID, APNS_CLIP_BUNDLE_ID, optional IOS_APP_BUNDLE_ID
// (defaults to the clip ID without ".Clip").
export const dynamic = "force-dynamic";

export function GET() {
  const teamId = process.env.APNS_TEAM_ID;
  const clipId = process.env.APNS_CLIP_BUNDLE_ID;
  if (!teamId || !clipId) {
    return NextResponse.json({ error: "iOS app not configured" }, { status: 404 });
  }
  const appId = process.env.IOS_APP_BUNDLE_ID || clipId.replace(/\.Clip$/, "");

  return NextResponse.json({
    appclips: {
      apps: [`${teamId}.${clipId}`],
    },
    applinks: {
      details: [
        {
          appIDs: [`${teamId}.${appId}`],
          components: [{ "/": "/t/*" }, { "/": "/track" }],
        },
      ],
    },
  });
}
