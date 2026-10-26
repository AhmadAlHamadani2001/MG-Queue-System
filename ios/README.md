# MG Queue — iPhone app + App Clip

Native iOS part of the MG Queue System. The customer scans the branch QR code and the
**App Clip** opens without an install. When their turn comes, the iPhone plays the MG chime
on the lock screen and shows a **Live Activity** (Lock Screen + Dynamic Island) with their
ticket number and how many people are ahead.

The Mac work is done in the cloud. **XcodeGen** creates the Xcode project from
`project.yml`, and **Codemagic** (free tier, Mac mini M2) builds it and uploads it to
**TestFlight**.

```
ios/
  project.yml                 XcodeGen spec (4 targets)
  App/                        full app: SwiftUI home screen (EN/AR), opens /track
  Clip/                       App Clip: opens its invocation URL (/branch/<code>, /t/<id>)
  Widgets/                    widget bundle entry (both widget extensions)
  Shared/
    QueueActivityAttributes.swift   ActivityKit model (server contract!)
    QueueLiveActivityView.swift     Lock Screen + Dynamic Island UI
    WebShell.swift                  WKWebView (UA contains "MGQueueClip")
    TicketSession.swift             permissions, /api/ios/register, Live Activity
    AppDelegate.swift               APNs device token, notification taps
    Brand.swift                     MG red, site URLs
  Config/                     Info.plists + entitlements
  Resources/
    mg-chime.caf              notification sound (ding-dong x3)
    Assets.xcassets           app icon (1024, no alpha), MG logo, colors
  scripts/
    make_chime.py             regenerates mg-chime.caf (+ .wav to listen to)
    make_icons.py             regenerates icons from public/ (needs Pillow)
```

| Target | Type | Bundle ID |
|---|---|---|
| MGQueue | App (iOS 16.2+) | `com.mgqueue.app` |
| MGQueueWidgets | Widget extension in the app | `com.mgqueue.app.Widgets` |
| MGQueueClip | App Clip | `com.mgqueue.app.Clip` |
| MGQueueClipWidgets | Widget extension in the clip | `com.mgqueue.app.Clip.Widgets` |

If you use a different base than `com.mgqueue.app`, replace it **everywhere in this guide**.

---

## One-time setup (no Mac needed)

You need:
- the Apple Developer account (personal or organization, USD 99/year),
- an iPhone with the **TestFlight** app from the App Store,
- the GitHub repo `AhmadAlHamadani2001/MG-Queue-System`.

Do the steps in this order. Provisioning profiles only include the capabilities that were
enabled **before** the profile was created.

### 1. Find your Team ID

1. Open <https://developer.apple.com/account> and sign in.
2. Scroll to **Membership details** and copy the **Team ID** (10 characters, e.g. `A1B2C3D4E5`).

### 2. Register the 4 bundle IDs and their capabilities

Go to <https://developer.apple.com/account/resources/identifiers/list>
(**Certificates, IDs & Profiles → Identifiers**).

**a) The app: `com.mgqueue.app`**
1. Click the blue **+**, choose **App IDs**, then **Continue**.
2. Choose type **App**, then **Continue**.
3. Description: `MG Queue`. Bundle ID: **Explicit**, `com.mgqueue.app`.
4. Under **Capabilities**, tick:
   - **Associated Domains**
   - **Push Notifications**
   - **Time Sensitive Notifications**
5. Click **Continue**, then **Register**.

**b) The App Clip: `com.mgqueue.app.Clip`**
1. Click **+**, choose **App IDs**, then **Continue**.
2. Choose type **App Clip**, then **Continue**.
3. Description: `MG Queue Clip`. Parent App ID: `com.mgqueue.app`. Bundle ID suffix: `Clip`.
4. Tick **Associated Domains**, **Push Notifications** and **Time Sensitive Notifications**.
   (On Demand Install Capable is already on.)
5. Click **Continue**, then **Register**.

**c) The two widget extensions**
Do this twice: once with `com.mgqueue.app.Widgets` (description `MG Queue Widgets`) and once
with `com.mgqueue.app.Clip.Widgets` (description `MG Queue Clip Widgets`).
1. Click **+**, choose **App IDs**, **Continue**, type **App**, **Continue**.
2. Bundle ID: **Explicit**, type the ID. No capabilities are needed.
3. Click **Continue**, then **Register**.

### 3. Create the APNs key (.p8) for the server

1. Go to **Certificates, IDs & Profiles → Keys** and click **+**.
2. Key name: `MG Queue APNs`. Tick **Apple Push Notifications service (APNs)**.
3. Click **Configure**. Environment: **Sandbox & Production**. Key restriction: **Team Scoped (All Topics)**. Click **Save**.
4. Click **Continue**, then **Register**, then **Download**.
   **You can download it only once.** Keep the `AuthKey_XXXXXXXXXX.p8` file safe.
5. Copy the **Key ID**.
6. In Vercel (**Project → Settings → Environment Variables**), add:
   - `APNS_KEY_ID` = the Key ID
   - `APNS_TEAM_ID` = your Team ID
   - `APNS_PRIVATE_KEY` = the whole content of the .p8 file, including the `-----BEGIN PRIVATE KEY-----` lines
   - `APNS_CLIP_BUNDLE_ID` = `com.mgqueue.app.Clip`
   - `IOS_APP_BUNDLE_ID` = `com.mgqueue.app` (optional)
7. Redeploy. Then open
   <https://mgqueuesystem.vercel.app/.well-known/apple-app-site-association>.
   It must show JSON with `YOURTEAMID.com.mgqueue.app.Clip`, not an error.

### 4. Create the App Store Connect API key (for Codemagic)

1. Open <https://appstoreconnect.apple.com> and go to **Users and Access → Integrations → App Store Connect API**.
   (The first time, click **Request Access** and accept.)
2. Under **Team Keys**, click **+** (Generate API Key).
3. Name: `Codemagic`. Access: **App Manager**. Click **Generate**.
4. Copy the **Issuer ID** (top of the page) and the **Key ID**.
5. Click **Download API Key**. **It can be downloaded only once.**

### 5. Create the App Store Connect app record

1. In App Store Connect, go to **Apps** and click **+ → New App**.
2. Fill in:
   - Platforms: **iOS**
   - Name: e.g. `MG Queue – Jiad` (the name must be unique on the App Store)
   - Primary language: **English (U.S.)** or **Arabic**
   - Bundle ID: `com.mgqueue.app`
   - SKU: `mgqueue`
   - User access: **Full Access**
3. Click **Create**.
4. Open **App Information** (left menu) and copy the numeric **Apple ID** (e.g. `6501234567`).

You don't create the App Clip separately. It appears after the first build that contains it
is uploaded.

### 6. Fill in the placeholders in the repo

| File | Setting | Value |
|---|---|---|
| `ios/project.yml` | `DEVELOPMENT_TEAM` | your Team ID |
| `ios/project.yml` | `MG_BUNDLE_BASE` | `com.mgqueue.app` (or your base) |
| `codemagic.yaml` | `ios_signing.bundle_identifier` | same as `MG_BUNDLE_BASE` |
| `codemagic.yaml` | `APP_STORE_APPLE_ID` | the numeric Apple ID from step 5 |
| `codemagic.yaml` | `integrations.app_store_connect` | the integration name from step 7 (default `app_store_connect`) |

Don't push yet. Finish step 7 first.

### 7. Set up Codemagic

1. Go to <https://codemagic.io/signup> and sign up with **GitHub**.
2. Click **Add application**, choose **GitHub**, pick `MG-Queue-System`, and choose project type **iOS App**.
   Codemagic finds `codemagic.yaml` automatically.
3. **Connect the API key:** click your avatar → **Team settings** (or **User settings**) → **Team integrations** →
   **Developer Portal** → **Connect**.
   - App Store Connect API key name: `app_store_connect` (must match `codemagic.yaml`)
   - Issuer ID, Key ID: from step 4
   - API key: upload the `.p8` from step 4
   - Click **Save**.
4. **Create the distribution certificate:** go to **Team settings → codemagic.yaml settings → Code signing identities → iOS certificates**.
   - Click **Generate certificate**.
   - Select the API key `app_store_connect` and type **Apple Distribution**.
   - Reference name: `mg_distribution`. Click **Create certificate**.
   - Download the .p12 and save the password Codemagic shows, as a backup.
5. **Create the 4 provisioning profiles** in the Apple Developer site:
   Go to **Certificates, IDs & Profiles → Profiles** and click **+**.
   Repeat for each of the 4 bundle IDs:
   1. Choose **Distribution → App Store Connect** and click **Continue**.
   2. Pick the App ID (`com.mgqueue.app`, `com.mgqueue.app.Widgets`, `com.mgqueue.app.Clip`, `com.mgqueue.app.Clip.Widgets`).
   3. Pick the certificate Codemagic created (Apple Distribution, today's date).
   4. Name it, for example `MGQueue AppStore`, `MGQueue Widgets AppStore`, and so on. Click **Generate**.
6. Back in Codemagic: **Code signing identities → iOS provisioning profiles → Fetch profiles**.
   Select the 4 profiles and click **Download selected**.
7. Now commit the placeholder changes from step 6 and push to `main`. Any push that changes `ios/**` or
   `codemagic.yaml` starts the **ios-testflight** workflow. You can also start it with
   **Start new build** in Codemagic.

The build takes about 10–15 minutes. The free tier gives 500 Mac mini M2 minutes per month.
A green build means the ipa (with the App Clip inside) was uploaded to App Store Connect.
Apple then needs 5–30 minutes to process it.

### 8. Test with TestFlight

1. In App Store Connect, go to **Apps → MG Queue → TestFlight**.
2. If the build shows **Missing Compliance**, answer **No** to encryption.
   (`ITSAppUsesNonExemptEncryption = NO` should already skip this.)
3. Under **Internal Testing**, click **+**, create the group `MG team`, and add yourself and Mostafa
   (you must be users in **Users and Access**). Enable the build for the group.
4. On the iPhone, open the TestFlight invitation email and install **MG Queue**.
5. **Test the App Clip:** in App Store Connect → TestFlight → click the build → **App Clip** →
   **App Clip Invocations** → **+** and add, for example:
   - `https://mgqueuesystem.vercel.app/branch/<branch code>` — title `Branch registration`
   On the iPhone, open TestFlight → MG Queue → **App Clips** → tap the invocation.
6. Register a ticket in the clip. Allow notifications on the card if asked.
   You should see the Live Activity on the Lock Screen and in the Dynamic Island.
7. From an advisor dashboard, call the ticket. The phone should play the ding-dong chime on the lock screen,
   and the Live Activity should change to **"It's your turn · حان دورك"**.

### 9. App Clip experiences (QR codes for customers)

The App Clip card for the public (scan QR, open without install) works only after the app is
**approved and released on the App Store**. Until then, use the TestFlight invocations from step 8.

1. App Store Connect → **Apps → MG Queue → App Store** tab → your version page → section **App Clip**:
   - Fill in the **Default App Clip Experience**:
     - Header image: 1800×1200 PNG/JPG
     - Subtitle: e.g. `Join the MG service queue`
     - Action: **Open**
2. Submit the version for review. You need a privacy policy URL and screenshots of the full app.
3. After approval, go to the app's **App Clip Experiences** page (left menu, under the App Store tab),
   then **Advanced App Clip Experiences**, and click **+**:
   - Experience 1:
     - URL: `https://mgqueuesystem.vercel.app/branch/`
     - Title: `MG Queue`
     - Subtitle: `Register and track your turn`
     - Action: **Open**
     - Header image: 1800×1200
     - Category: **Automotive** (or "Other")
     - Location: optional
   - Experience 2:
     - URL: `https://mgqueuesystem.vercel.app/t/`
     - Subtitle: `Track your ticket`
   A URL prefix covers every page under it, e.g. every `/branch/<code>`.
4. Apple checks the `appclips` entry at `/.well-known/apple-app-site-association` (step 3.7).
   The existing branch QR codes then open the App Clip card on iPhones.

---

## Day-to-day

- Change Swift code, push to `main`, and Codemagic uploads a new TestFlight build.
  The build number is bumped automatically.
- Change the chime: edit `ios/scripts/make_chime.py`, run `python ios/scripts/make_chime.py`, and commit `ios/Resources/mg-chime.caf`.
- Change the icon: replace `public/icon-512.png`, run `python ios/scripts/make_icons.py`.
- Vercel ignores `ios/` (`.vercelignore`).

## Contracts with the server (do not change one side only)

- `POST https://mgqueuesystem.vercel.app/api/ios/register`
  - Body: `{ticketId, deviceToken?, activityToken?}`, with tokens as lowercase hex.
  - Response: `{ticketNumber, branchName, status, position, advisorName}`.
- Live Activity `content-state` keys: `status`, `position` (1-based, `null` when not waiting), `advisorName`.
- Notification sound name: `mg-chime.caf`. Notification payload field `url` (e.g. `/t/<id>`) opens that page on tap.
- WebView user agent contains `MGQueueClip`. The site uses it to hide its Web Push prompts.

## Known limits

- The server sends APNs with topic `APNS_CLIP_BUNDLE_ID` (the clip).
  Tokens registered from the **full app** need topic `com.mgqueue.app`, so alerts and Live Activity pushes to the full app need a server change.
- App Clip notifications are ephemeral: they work for 8 hours after the clip was opened.
  That is plenty for a service visit.
- Without a Mac, the iOS Simulator isn't available. Test only through TestFlight on a real iPhone.
