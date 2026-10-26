import ActivityKit
import SwiftUI
import WidgetKit

// Lock Screen banner + Dynamic Island for a queue ticket. Compiled only
// into the two widget extensions (MGQueueWidgets, MGQueueClipWidgets).

struct QueueLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: QueueActivityAttributes.self) { context in
            QueueLockScreenView(attributes: context.attributes, state: context.state)
                .activityBackgroundTint(context.state.isCalled ? Brand.red : Color.white)
                .activitySystemActionForegroundColor(context.state.isCalled ? Color.white : Brand.red)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(verbatim: "MG")
                            .font(.caption2.weight(.heavy))
                            .foregroundColor(Brand.red)
                        Text(verbatim: "#\(context.attributes.ticketNumber)")
                            .font(.title3.weight(.bold))
                            .foregroundColor(.white)
                    }
                    .padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    VStack(alignment: .trailing, spacing: 2) {
                        if let ahead = context.state.peopleAhead {
                            Text(verbatim: "\(ahead)")
                                .font(.title3.weight(.bold))
                                .foregroundColor(.white)
                            Text(verbatim: "ahead · قبلك")
                                .font(.caption2)
                                .foregroundColor(.gray)
                        } else {
                            Image(systemName: context.state.symbolName)
                                .font(.title3)
                                .foregroundColor(context.state.isCalled ? Brand.red : .white)
                        }
                    }
                    .padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(verbatim: context.attributes.branchName)
                        .font(.caption)
                        .foregroundColor(.gray)
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    ExpandedBottomView(state: context.state)
                }
            } compactLeading: {
                Text(verbatim: "#\(context.attributes.ticketNumber)")
                    .font(.caption.weight(.bold))
                    .foregroundColor(Brand.red)
            } compactTrailing: {
                if context.state.isCalled {
                    Image(systemName: "bell.fill")
                        .foregroundColor(Brand.red)
                } else if let ahead = context.state.peopleAhead {
                    HStack(spacing: 2) {
                        Image(systemName: "person.2.fill")
                            .font(.caption2)
                        Text(verbatim: "\(ahead)")
                            .font(.caption.weight(.bold))
                    }
                    .foregroundColor(.white)
                } else {
                    Image(systemName: context.state.symbolName)
                        .foregroundColor(.white)
                }
            } minimal: {
                if context.state.isCalled {
                    Image(systemName: "bell.fill")
                        .foregroundColor(Brand.red)
                } else if let ahead = context.state.peopleAhead {
                    Text(verbatim: "\(ahead)")
                        .font(.caption.weight(.bold))
                        .foregroundColor(Brand.red)
                } else {
                    Image(systemName: context.state.symbolName)
                        .foregroundColor(Brand.red)
                }
            }
            .keylineTint(Brand.red)
        }
    }
}

// MARK: - Lock Screen

struct QueueLockScreenView: View {
    let attributes: QueueActivityAttributes
    let state: QueueActivityAttributes.ContentState

    var body: some View {
        if state.isCalled {
            calledBody
        } else {
            regularBody
        }
    }

    /// "It's your turn" — big and white on MG red.
    private var calledBody: some View {
        VStack(spacing: 6) {
            HStack {
                Text(verbatim: "MG · #\(attributes.ticketNumber)")
                    .font(.subheadline.weight(.bold))
                Spacer()
                Image(systemName: "bell.fill")
            }
            Text(verbatim: "It's your turn · حان دورك")
                .font(.title2.weight(.heavy))
                .multilineTextAlignment(.center)
                .minimumScaleFactor(0.7)
                .lineLimit(2)
                .frame(maxWidth: .infinity)
            if let advisor = state.advisorName, !advisor.isEmpty {
                Text(verbatim: "Advisor · المستشار: \(advisor)")
                    .font(.subheadline)
                    .lineLimit(1)
            } else {
                Text(verbatim: "Please go to the service desk · تفضل إلى مكتب الخدمة")
                    .font(.footnote)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .foregroundColor(.white)
        .padding(16)
    }

    private var regularBody: some View {
        HStack(alignment: .center, spacing: 14) {
            VStack(spacing: 2) {
                Text(verbatim: "MG")
                    .font(.caption2.weight(.heavy))
                Text(verbatim: "#\(attributes.ticketNumber)")
                    .font(.title3.weight(.bold))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
            .foregroundColor(.white)
            .frame(width: 72, height: 64)
            .background(RoundedRectangle(cornerRadius: 12).fill(Brand.red))

            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: state.statusEnglish)
                    .font(.headline)
                    .foregroundColor(.black)
                Text(verbatim: state.statusArabic)
                    .font(.subheadline)
                    .foregroundColor(.black.opacity(0.75))
                Text(verbatim: state.detailLine)
                    .font(.caption)
                    .foregroundColor(.gray)
                    .lineLimit(1)
            }

            Spacer(minLength: 0)

            if let ahead = state.peopleAhead {
                VStack(spacing: 0) {
                    Text(verbatim: "\(ahead)")
                        .font(.system(size: 30, weight: .heavy))
                        .foregroundColor(Brand.red)
                    Text(verbatim: "ahead · قبلك")
                        .font(.caption2)
                        .foregroundColor(.gray)
                }
            }
        }
        .padding(14)
    }
}

// MARK: - Dynamic Island expanded bottom

private struct ExpandedBottomView: View {
    let state: QueueActivityAttributes.ContentState

    var body: some View {
        VStack(spacing: 4) {
            if state.isCalled {
                Text(verbatim: "It's your turn · حان دورك")
                    .font(.title3.weight(.heavy))
                    .foregroundColor(Brand.red)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            } else {
                Text(verbatim: "\(state.statusEnglish) · \(state.statusArabic)")
                    .font(.headline)
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
            Text(verbatim: state.detailLine)
                .font(.caption)
                .foregroundColor(.gray)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Display helpers

extension QueueActivityAttributes.ContentState {
    var isCalled: Bool { status == "called" }

    /// People in front of this ticket (server position is 1-based).
    var peopleAhead: Int? {
        guard status == "waiting", let position = position else { return nil }
        return max(0, position - 1)
    }

    /// Wait estimate in minutes, same formula as the web page.
    var etaMinutes: Int? {
        guard status == "waiting", let position = position else { return nil }
        return max(1, position) * Brand.minutesPerPerson
    }

    var statusEnglish: String {
        switch status {
        case "waiting": return "Waiting"
        case "called": return "It's your turn"
        case "in_service": return "In service"
        case "completed": return "Completed"
        case "no_show": return "Missed"
        case "cancelled": return "Cancelled"
        default: return status
        }
    }

    var statusArabic: String {
        switch status {
        case "waiting": return "في الانتظار"
        case "called": return "حان دورك"
        case "in_service": return "قيد الخدمة"
        case "completed": return "تمت الخدمة"
        case "no_show": return "لم يتم الحضور"
        case "cancelled": return "ملغاة"
        default: return status
        }
    }

    var symbolName: String {
        switch status {
        case "called": return "bell.fill"
        case "in_service": return "wrench.and.screwdriver.fill"
        case "completed": return "checkmark.circle.fill"
        case "no_show", "cancelled": return "xmark.circle.fill"
        default: return "clock.fill"
        }
    }

    /// Second line: ETA while waiting, otherwise the advisor.
    var detailLine: String {
        if let eta = etaMinutes {
            return "~\(eta) min · ~\(eta) دقيقة"
        }
        if let advisor = advisorName, !advisor.isEmpty {
            return "Advisor · المستشار: \(advisor)"
        }
        return "MG After-Sales · خدمة ما بعد البيع"
    }
}
