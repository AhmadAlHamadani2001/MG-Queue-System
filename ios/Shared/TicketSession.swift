import ActivityKit
import Foundation
import UIKit
import UserNotifications

/// Connects the ticket the customer is looking at to native iOS alerts:
/// 1. asks for notification permission (App Clip: ephemeral, no prompt)
///    and registers for remote notifications,
/// 2. POSTs /api/ios/register with the ticket ID to get its info,
/// 3. starts one Live Activity per ticket (push-token type),
/// 4. posts the APNs device token and Live Activity push token when they
///    arrive, so the server can push the "your turn" alert and updates.
///
/// Public entry points can be called from any thread; all state lives on
/// the main actor.
final class TicketSession: ObservableObject {
    static let shared = TicketSession()

    /// Ticket the customer last opened (persisted).
    @Published private(set) var currentTicketId: String?
    /// URL a notification tap asks the WebView to open.
    @Published private(set) var deepLink: URL?

    private var deviceToken: String?
    private var lastPostedDeviceToken: [String: String] = [:]
    private var inFlight: Set<String> = []
    private var tokenObservers: [String: Task<Void, Never>] = [:]

    private let defaults = UserDefaults.standard
    private let lastTicketKey = "mg.lastTicketId"
    private let activityMapKey = "mg.activityByTicket"

    private static let terminalStatuses: Set<String> = ["completed", "no_show", "cancelled"]

    init() {
        currentTicketId = defaults.string(forKey: lastTicketKey)
    }

    var lastTicketURL: URL? {
        currentTicketId.map { Brand.ticketURL($0) }
    }

    // MARK: - Public entry points

    /// Returns the ticket UUID if `url` is https://mgqueuesystem.vercel.app/t/<uuid>.
    static func ticketId(from url: URL) -> String? {
        guard url.host?.lowercased() == Brand.host else { return nil }
        let parts = url.path.split(separator: "/")
        guard parts.count >= 2, parts[0] == "t" else { return nil }
        let candidate = String(parts[1])
        guard UUID(uuidString: candidate) != nil else { return nil }
        return candidate.lowercased()
    }

    /// Called when the WebView lands on /t/<uuid>. Safe to call repeatedly.
    func start(ticketId: String) {
        let id = ticketId.lowercased()
        guard UUID(uuidString: id) != nil else { return }
        Task { @MainActor in
            await self.begin(ticketId: id)
        }
    }

    /// From the app delegate when APNs hands out the device token.
    func didReceiveDeviceToken(_ token: Data) {
        let hex = token.hexString
        Task { @MainActor in
            self.deviceToken = hex
            if let id = self.currentTicketId {
                await self.postDeviceTokenIfNeeded(ticketId: id)
            }
        }
    }

    /// From a notification tap: open the given site path or URL.
    func open(pathOrURL: String) {
        let url: URL?
        if pathOrURL.hasPrefix("http") {
            url = URL(string: pathOrURL)
        } else {
            url = URL(string: pathOrURL, relativeTo: Brand.siteURL)?.absoluteURL
        }
        guard let target = url, target.host?.lowercased() == Brand.host else { return }
        Task { @MainActor in
            self.deepLink = target
        }
    }

    // MARK: - Main-actor work

    @MainActor
    private func begin(ticketId: String) async {
        if currentTicketId != ticketId {
            currentTicketId = ticketId
            defaults.set(ticketId, forKey: lastTicketKey)
        }
        guard !inFlight.contains(ticketId) else { return }
        inFlight.insert(ticketId)
        defer { inFlight.remove(ticketId) }

        await prepareNotifications()

        let tokenAtCall = deviceToken
        guard let info = await registerWithRetry(ticketId: ticketId, deviceToken: tokenAtCall, activityToken: nil) else {
            return
        }
        if let token = tokenAtCall {
            lastPostedDeviceToken[ticketId] = token
        }
        await syncActivity(ticketId: ticketId, info: info)
    }

    @MainActor
    private func prepareNotifications() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        if settings.authorizationStatus == .notDetermined {
            // Full app: normal prompt. App Clip: already ephemeral when the
            // customer allowed it on the App Clip card, so this is skipped.
            _ = try? await center.requestAuthorization(options: [.alert, .sound, .badge])
        }
        UIApplication.shared.registerForRemoteNotifications()
    }

    @MainActor
    private func postDeviceTokenIfNeeded(ticketId: String) async {
        guard let token = deviceToken, lastPostedDeviceToken[ticketId] != token else { return }
        if await registerWithRetry(ticketId: ticketId, deviceToken: token, activityToken: nil) != nil {
            lastPostedDeviceToken[ticketId] = token
        }
    }

    // MARK: - Live Activity

    @MainActor
    private func syncActivity(ticketId: String, info: RegisterResponse) async {
        let state = QueueActivityAttributes.ContentState(
            status: info.status,
            position: info.position,
            advisorName: info.advisorName
        )
        let content = ActivityContent(state: state, staleDate: nil)
        let isTerminal = Self.terminalStatuses.contains(info.status)

        // Already running for this ticket: refresh it, never start a second one.
        if let existing = existingActivity(for: ticketId, info: info) {
            if isTerminal {
                await existing.end(content, dismissalPolicy: .default)
                forgetActivity(for: ticketId)
            } else {
                await existing.update(content)
                observePushTokens(of: existing, ticketId: ticketId)
            }
            return
        }

        guard !isTerminal, ActivityAuthorizationInfo().areActivitiesEnabled else { return }

        // One ticket at a time: close activities left over from older tickets.
        for old in Activity<QueueActivityAttributes>.activities {
            await old.end(nil, dismissalPolicy: .immediate)
        }

        let attributes = QueueActivityAttributes(ticketNumber: info.ticketNumber, branchName: info.branchName)
        do {
            let activity = try Activity<QueueActivityAttributes>.request(
                attributes: attributes,
                content: content,
                pushType: .token
            )
            rememberActivity(activity.id, for: ticketId)
            observePushTokens(of: activity, ticketId: ticketId)
        } catch {
            print("[MGQueue] Live Activity request failed: \(error)")
        }
    }

    @MainActor
    private func existingActivity(for ticketId: String, info: RegisterResponse) -> Activity<QueueActivityAttributes>? {
        let running = Activity<QueueActivityAttributes>.activities.filter {
            $0.activityState != .ended && $0.activityState != .dismissed
        }
        if let storedId = activityMap()[ticketId], let match = running.first(where: { $0.id == storedId }) {
            return match
        }
        // Fallback if the stored map was lost.
        return running.first {
            $0.attributes.ticketNumber == info.ticketNumber && $0.attributes.branchName == info.branchName
        }
    }

    @MainActor
    private func observePushTokens(of activity: Activity<QueueActivityAttributes>, ticketId: String) {
        guard tokenObservers[activity.id] == nil else { return }
        let activityId = activity.id
        tokenObservers[activityId] = Task { @MainActor [weak self] in
            for await tokenData in activity.pushTokenUpdates {
                guard let self = self else { return }
                _ = await self.registerWithRetry(
                    ticketId: ticketId,
                    deviceToken: self.deviceToken,
                    activityToken: tokenData.hexString
                )
            }
            self?.tokenObservers[activityId] = nil
        }
    }

    private func activityMap() -> [String: String] {
        defaults.dictionary(forKey: activityMapKey) as? [String: String] ?? [:]
    }

    private func rememberActivity(_ activityId: String, for ticketId: String) {
        var map = activityMap()
        map[ticketId] = activityId
        defaults.set(map, forKey: activityMapKey)
    }

    private func forgetActivity(for ticketId: String) {
        var map = activityMap()
        map[ticketId] = nil
        defaults.set(map, forKey: activityMapKey)
    }

    // MARK: - Network

    private func registerWithRetry(ticketId: String, deviceToken: String?, activityToken: String?) async -> RegisterResponse? {
        for attempt in 0..<3 {
            do {
                return try await register(ticketId: ticketId, deviceToken: deviceToken, activityToken: activityToken)
            } catch RegisterError.rejected(let code) {
                print("[MGQueue] register rejected: HTTP \(code)")
                return nil
            } catch {
                print("[MGQueue] register failed (attempt \(attempt + 1)): \(error)")
                try? await Task.sleep(nanoseconds: UInt64(attempt + 1) * 2_000_000_000)
            }
        }
        return nil
    }

    private func register(ticketId: String, deviceToken: String?, activityToken: String?) async throws -> RegisterResponse {
        var body: [String: String] = ["ticketId": ticketId]
        if let deviceToken = deviceToken { body["deviceToken"] = deviceToken }
        if let activityToken = activityToken { body["activityToken"] = activityToken }

        var request = URLRequest(url: Brand.registerURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 15
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? 0
        if code >= 400 && code < 500 { throw RegisterError.rejected(code) }
        guard code == 200 else { throw RegisterError.server(code) }
        return try JSONDecoder().decode(RegisterResponse.self, from: data)
    }
}

// MARK: - Models

private enum RegisterError: Error {
    case rejected(Int)
    case server(Int)
}

/// Response of POST /api/ios/register.
struct RegisterResponse: Decodable {
    let ticketNumber: String
    let branchName: String
    let status: String
    let position: Int?
    let advisorName: String?

    private enum CodingKeys: String, CodingKey {
        case ticketNumber, branchName, status, position, advisorName
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        // ticket_number may come back as a number or a string.
        if let text = try? c.decode(String.self, forKey: .ticketNumber) {
            ticketNumber = text
        } else if let number = try? c.decode(Int.self, forKey: .ticketNumber) {
            ticketNumber = String(number)
        } else {
            ticketNumber = "—"
        }
        branchName = (try? c.decodeIfPresent(String.self, forKey: .branchName)) ?? "MG"
        status = (try? c.decodeIfPresent(String.self, forKey: .status)) ?? "waiting"
        position = try? c.decodeIfPresent(Int.self, forKey: .position)
        advisorName = try? c.decodeIfPresent(String.self, forKey: .advisorName)
    }
}

extension Data {
    /// APNs tokens as lowercase hex, the format the server expects.
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
