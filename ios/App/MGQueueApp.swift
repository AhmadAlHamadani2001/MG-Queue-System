import SwiftUI

/// Full app: native home screen + ticket tracking + Live Activity.
@main
struct MGQueueApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var session = TicketSession.shared

    var body: some Scene {
        WindowGroup {
            HomeView()
                .environmentObject(session)
        }
    }
}
