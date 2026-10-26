import SwiftUI

/// App Clip: opened from the branch QR code (/branch/<code>) or a ticket
/// link (/t/<uuid>). Shows that page; once the customer has a ticket the
/// session starts the Live Activity and the "your turn" alert.
@main
struct MGQueueClipApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = TicketSession.shared

    var body: some Scene {
        WindowGroup {
            ClipRootView(session: session)
        }
    }
}

struct ClipRootView: View {
    @ObservedObject var session: TicketSession
    @State private var url: URL?

    var body: some View {
        Group {
            if let url = url {
                WebShell(url: url)
                    .ignoresSafeArea(edges: .bottom)
            } else {
                ProgressView()
                    .tint(Brand.red)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let incoming = activity.webpageURL {
                open(incoming)
            }
        }
        .onReceive(session.$deepLink.compactMap { $0 }) { link in
            open(link)
        }
        .task {
            // No invocation URL (e.g. opened from TestFlight without one):
            // fall back to the last ticket, then to the mobile lookup page.
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            if url == nil {
                url = session.lastTicketURL ?? Brand.trackURL
            }
        }
    }

    private func open(_ incoming: URL) {
        let target = incoming.host?.lowercased() == Brand.host ? incoming : Brand.trackURL
        url = target
        if let ticketId = TicketSession.ticketId(from: target) {
            session.start(ticketId: ticketId)
        }
    }
}
