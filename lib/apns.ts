import http2 from "http2";
import crypto from "crypto";

// Apple Push Notification service (APNs) sender for the iPhone App Clip.
// Server-only. Uses token auth (.p8 key) — the JWT is signed with Node's
// crypto, so no extra dependency. TestFlight and App Store builds both
// use the production APNs host.
//
// Env (Vercel):
//   APNS_KEY_ID          10-char key ID of the .p8 key
//   APNS_TEAM_ID         Apple Developer team ID
//   APNS_PRIVATE_KEY     full .p8 file contents (newlines or "\n" escapes)
//   APNS_CLIP_BUNDLE_ID  App Clip bundle ID, e.g. com.mgqueue.app.Clip

const APNS_HOST = "https://api.push.apple.com";

export type LiveActivityState = {
  status: string;
  position: number | null;
  advisorName: string | null;
};

export type ApnsResult = { ok: boolean; status: number; reason?: string };

export function apnsConfigured(): boolean {
  return Boolean(
    process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY && process.env.APNS_CLIP_BUNDLE_ID
  );
}

// Apple rejects tokens older than 1h and throttles too-frequent new
// ones, so reuse one for 50 minutes.
let cachedJwt: { token: string; issuedAt: number } | null = null;

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && now - cachedJwt.issuedAt < 50 * 60) return cachedJwt.token;

  const keyId = process.env.APNS_KEY_ID as string;
  const teamId = process.env.APNS_TEAM_ID as string;
  const privateKey = (process.env.APNS_PRIVATE_KEY as string).replace(/\\n/g, "\n");

  const header = base64url(JSON.stringify({ alg: "ES256", kid: keyId }));
  const claims = base64url(JSON.stringify({ iss: teamId, iat: now }));
  const signingInput = `${header}.${claims}`;
  // APNs wants the raw (r||s) signature, not DER.
  const signature = crypto.sign("sha256", Buffer.from(signingInput), { key: privateKey, dsaEncoding: "ieee-p1363" });
  const token = `${signingInput}.${base64url(signature)}`;
  cachedJwt = { token, issuedAt: now };
  return token;
}

function send(deviceToken: string, headers: Record<string, string>, payload: object): Promise<ApnsResult> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: ApnsResult) => {
      if (settled) return;
      settled = true;
      client.close();
      resolve(result);
    };

    const client = http2.connect(APNS_HOST);
    client.on("error", (err) => finish({ ok: false, status: 0, reason: err.message }));
    client.setTimeout(10000, () => finish({ ok: false, status: 0, reason: "timeout" }));

    const req = client.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${getJwt()}`,
      "content-type": "application/json",
      ...headers,
    });

    let status = 0;
    let body = "";
    req.setEncoding("utf8");
    req.on("response", (h) => {
      status = Number(h[":status"]) || 0;
    });
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => {
      let reason: string | undefined;
      try {
        reason = body ? (JSON.parse(body) as { reason?: string }).reason : undefined;
      } catch {
        reason = body || undefined;
      }
      finish({ ok: status === 200, status, reason });
    });
    req.on("error", (err) => finish({ ok: false, status: 0, reason: err.message }));
    req.end(JSON.stringify(payload));
  });
}

// True when the token will never work again and should be deleted.
export function isDeadToken(result: ApnsResult): boolean {
  return (
    result.status === 410 ||
    result.reason === "BadDeviceToken" ||
    result.reason === "Unregistered" ||
    result.reason === "ExpiredToken"
  );
}

// Lock-screen alert with the MG chime. time-sensitive breaks through
// Focus modes (the App Clip has the Time Sensitive entitlement).
export function sendAlert(deviceToken: string, title: string, body: string, url?: string): Promise<ApnsResult> {
  return send(
    deviceToken,
    {
      "apns-topic": process.env.APNS_CLIP_BUNDLE_ID as string,
      "apns-push-type": "alert",
      "apns-priority": "10",
    },
    {
      aps: {
        alert: { title, body },
        sound: "mg-chime.caf",
        "interruption-level": "time-sensitive",
      },
      url,
    }
  );
}

// Live Activity (Lock Screen + Dynamic Island) update or end.
// priority 10 = immediate (the call), 5 = low-priority (position moves;
// Apple throttles frequent priority-10 updates).
export function sendLiveActivity(
  activityToken: string,
  event: "update" | "end",
  state: LiveActivityState,
  options: { priority: 5 | 10; alert?: { title: string; body: string }; dismissInSeconds?: number }
): Promise<ApnsResult> {
  const now = Math.floor(Date.now() / 1000);
  const aps: Record<string, unknown> = {
    timestamp: now,
    event,
    "content-state": state,
  };
  if (options.alert) {
    aps.alert = options.alert;
    aps.sound = "mg-chime.caf";
  }
  if (event === "end") {
    aps["dismissal-date"] = now + (options.dismissInSeconds ?? 60);
  }
  return send(
    activityToken,
    {
      "apns-topic": `${process.env.APNS_CLIP_BUNDLE_ID}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": String(options.priority),
    },
    { aps }
  );
}
