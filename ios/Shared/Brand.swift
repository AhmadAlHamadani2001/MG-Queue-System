import SwiftUI

/// MG brand values and site URLs shared by the app, the App Clip and the
/// Live Activity widgets.
enum Brand {
    /// MG red #E20613.
    static let red = Color(red: 226.0 / 255.0, green: 6.0 / 255.0, blue: 19.0 / 255.0)

    static let host = "mgqueuesystem.vercel.app"
    static let siteURL = URL(string: "https://mgqueuesystem.vercel.app")!
    static let trackURL = URL(string: "https://mgqueuesystem.vercel.app/track")!
    static let registerURL = URL(string: "https://mgqueuesystem.vercel.app/api/ios/register")!

    /// Rough service time per person, same as the web tracking page.
    static let minutesPerPerson = 6

    /// Added to the WebView user agent. The website looks for "MGQueueClip"
    /// to hide its own Web Push prompts, because native alerts take over.
    #if APPCLIP
    static let userAgentSuffix = "MGQueueClip/1.0"
    #else
    static let userAgentSuffix = "MGQueueClip/1.0 MGQueueApp/1.0"
    #endif

    static func ticketURL(_ ticketId: String) -> URL {
        siteURL.appendingPathComponent("t").appendingPathComponent(ticketId)
    }
}
