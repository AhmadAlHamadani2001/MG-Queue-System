import SwiftUI
import WidgetKit

// Entry point of both widget extensions (app + App Clip). They only
// provide the queue Live Activity, no home-screen widgets.
@main
struct MGQueueWidgetBundle: WidgetBundle {
    var body: some Widget {
        QueueLiveActivityWidget()
    }
}
