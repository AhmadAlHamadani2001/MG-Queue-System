import ActivityKit
import SwiftUI

/// Native home screen of the full app (more than a web wrapper):
/// MG logo, EN/AR toggle, "find my ticket by mobile number", the
/// customer's current ticket, and Live Activity / alert status.
struct HomeView: View {
    @EnvironmentObject private var session: TicketSession
    @AppStorage("mg.lang") private var lang = "en"
    @State private var path: [URL] = []
    @State private var liveActivitiesOn = ActivityAuthorizationInfo().areActivitiesEnabled

    private var isArabic: Bool { lang == "ar" }

    private func t(_ english: String, _ arabic: String) -> String {
        isArabic ? arabic : english
    }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(spacing: 20) {
                    header
                    findTicketButton
                    if let ticketURL = session.lastTicketURL {
                        currentTicketCard(ticketURL)
                    }
                    featuresCard
                }
                .padding(20)
            }
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .navigationTitle(t("MG Queue", "ط·ط§ط¨ظˆط± MG"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button {
                        lang = isArabic ? "en" : "ar"
                    } label: {
                        Text(verbatim: isArabic ? "English" : "ط§ظ„ط¹ط±ط¨ظٹط©")
                            .font(.subheadline.weight(.semibold))
                    }
                    .accessibilityLabel(Text(verbatim: isArabic ? "Switch to English" : "ط§ظ„طھط¨ط¯ظٹظ„ ط¥ظ„ظ‰ ط§ظ„ط¹ط±ط¨ظٹط©"))
                }
            }
            .navigationDestination(for: URL.self) { url in
                WebScreen(url: url, title: t("MG Queue", "ط·ط§ط¨ظˆط± MG"))
            }
        }
        .tint(Brand.red)
        .environment(\.layoutDirection, isArabic ? .rightToLeft : .leftToRight)
        .environment(\.locale, Locale(identifier: isArabic ? "ar" : "en"))
        .onOpenURL { url in
            open(url)
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL {
                open(url)
            }
        }
        .onReceive(session.$deepLink.compactMap { $0 }) { url in
            open(url)
        }
        .onAppear {
            liveActivitiesOn = ActivityAuthorizationInfo().areActivitiesEnabled
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(spacing: 10) {
            Image("MGLogo")
                .resizable()
                .scaledToFit()
                .frame(width: 110, height: 110)
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .accessibilityLabel(Text(verbatim: "MG"))
            Text(verbatim: t("MG After-Sales Service", "ط®ط¯ظ…ط© ظ…ط§ ط¨ط¹ط¯ ط§ظ„ط¨ظٹط¹ MG"))
                .font(.title2.weight(.bold))
                .multilineTextAlignment(.center)
            Text(verbatim: t(
                "Follow your place in the service queue and get an alert when it's your turn.",
                "طھط§ط¨ط¹ ط¯ظˆط±ظƒ ظپظٹ ط·ط§ط¨ظˆط± ط§ظ„ط®ط¯ظ…ط© ظˆط§ط­طµظ„ ط¹ظ„ظ‰ طھظ†ط¨ظٹظ‡ ط¹ظ†ط¯ظ…ط§ ظٹط­ظٹظ† ط¯ظˆط±ظƒ."
            ))
            .font(.subheadline)
            .foregroundColor(.secondary)
            .multilineTextAlignment(.center)
        }
        .padding(.top, 8)
    }

    private var findTicketButton: some View {
        Button {
            open(Brand.trackURL)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "magnifyingglass")
                    .font(.title2.weight(.semibold))
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: t("Find my ticket by mobile number", "ط§ط¨ط­ط« ط¹ظ† طھط°ظƒط±طھظٹ ط¨ط±ظ‚ظ… ط§ظ„ط¬ظˆط§ظ„"))
                        .font(.headline)
                    Text(verbatim: t("Use the number you registered with at the branch", "ط§ط³طھط®ط¯ظ… ط§ظ„ط±ظ‚ظ… ط§ظ„ظ…ط³ط¬ظ„ ظ„ط¯ظ‰ ط§ظ„ظپط±ط¹"))
                        .font(.footnote)
                        .opacity(0.9)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .font(.headline)
            }
            .foregroundColor(.white)
            .padding(18)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(Brand.red))
        }
        .buttonStyle(.plain)
    }

    private func currentTicketCard(_ ticketURL: URL) -> some View {
        Button {
            open(ticketURL)
        } label: {
            HStack(spacing: 14) {
                Image(systemName: "ticket.fill")
                    .font(.title2)
                    .foregroundColor(Brand.red)
                VStack(alignment: .leading, spacing: 3) {
                    Text(verbatim: t("My current ticket", "طھط°ظƒط±طھظٹ ط§ظ„ط­ط§ظ„ظٹط©"))
                        .font(.headline)
                        .foregroundColor(.primary)
                    Text(verbatim: t("Open live status", "ط¹ط±ط¶ ط§ظ„ط­ط§ظ„ط© ط§ظ„ظ…ط¨ط§ط´ط±ط©"))
                        .font(.footnote)
                        .foregroundColor(.secondary)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.forward")
                    .foregroundColor(.secondary)
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
        }
        .buttonStyle(.plain)
    }

    private var featuresCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            featureRow(
                symbol: "bell.badge.fill",
                title: t("Alert with sound on your turn", "طھظ†ط¨ظٹظ‡ ط¨طµظˆطھ ط¹ظ†ط¯ ط­ظ„ظˆظ„ ط¯ظˆط±ظƒ"),
                detail: t("Works on the lock screen, even in Focus mode.", "ظٹط¸ظ‡ط± ط¹ظ„ظ‰ ط´ط§ط´ط© ط§ظ„ظ‚ظپظ„ ط­طھظ‰ ظپظٹ ظˆط¶ط¹ ط§ظ„طھط±ظƒظٹط².")
            )
            featureRow(
                symbol: "clock.fill",
                title: t("Live Activity & Dynamic Island", "ط§ظ„ظ†ط´ط§ط· ط§ظ„ظ…ط¨ط§ط´ط± ظˆ Dynamic Island"),
                detail: liveActivitiesOn
                    ? t("Your ticket number and people ahead stay on screen.", "ط±ظ‚ظ… طھط°ظƒط±طھظƒ ظˆط¹ط¯ط¯ ظ…ظ† ظ‚ط¨ظ„ظƒ ظٹط¨ظ‚ظ‰ ط¸ط§ظ‡ط±ظ‹ط§ ط¹ظ„ظ‰ ط§ظ„ط´ط§ط´ط©.")
                    : t("Turn on Live Activities in Settings â€؛ MG Queue.", "ظپط¹ظ‘ظ„ ط§ظ„ط£ظ†ط´ط·ط© ط§ظ„ظ…ط¨ط§ط´ط±ط© ظ…ظ† ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ â€؛ MG Queue.")
            )
            featureRow(
                symbol: "qrcode.viewfinder",
                title: t("At the branch? Scan the QR code", "ظپظٹ ط§ظ„ظپط±ط¹طں ط§ظ…ط³ط­ ط±ظ…ط² QR"),
                detail: t("Register in seconds and get your ticket.", "ط³ط¬ظ‘ظ„ ط®ظ„ط§ظ„ ط«ظˆط§ظ†ظچ ظˆط§ط­طµظ„ ط¹ظ„ظ‰ طھط°ظƒط±طھظƒ.")
            )
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(Color(.secondarySystemGroupedBackground)))
    }

    private func featureRow(symbol: String, title: String, detail: String) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(systemName: symbol)
                .font(.title3)
                .foregroundColor(Brand.red)
                .frame(width: 28)
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: title)
                    .font(.subheadline.weight(.semibold))
                Text(verbatim: detail)
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            Spacer(minLength: 0)
        }
    }

    // MARK: - Navigation

    private func open(_ url: URL) {
        guard url.host?.lowercased() == Brand.host else { return }
        if path.last == url { return }
        path = [url]
        if let ticketId = TicketSession.ticketId(from: url) {
            session.start(ticketId: ticketId)
        }
    }
}

/// The website inside the native navigation stack.
struct WebScreen: View {
    let url: URL
    let title: String

    var body: some View {
        WebShell(url: url)
            // The website handles its own RTL; never mirror the web view.
            .environment(\.layoutDirection, .leftToRight)
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
    }
}
