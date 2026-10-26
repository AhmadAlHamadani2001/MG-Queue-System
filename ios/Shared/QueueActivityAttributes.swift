import ActivityKit
import Foundation

/// Live Activity for one queue ticket (Lock Screen + Dynamic Island).
///
/// CONTRACT: the ContentState JSON keys `status`, `position` and
/// `advisorName` must match the server's APNs payloads
/// (lib/apns.ts `LiveActivityState`). Do not rename them.
struct QueueActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// waiting | called | in_service | completed | no_show | cancelled
        var status: String
        /// 1-based place in the waiting line (1 = next). nil when not waiting.
        var position: Int?
        var advisorName: String?
    }

    var ticketNumber: String
    var branchName: String
}
