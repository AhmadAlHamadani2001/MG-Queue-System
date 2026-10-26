import SwiftUI
import UIKit
import WebKit

/// WKWebView showing the MG Queue website.
/// - Adds "MGQueueClip" to the user agent so the site hides Web Push.
/// - Watches the URL (including client-side route changes) and starts the
///   native ticket session when it reaches /t/<uuid>.
/// - Opens phone, WhatsApp, maps and other external links outside the app.
struct WebShell: UIViewRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.applicationNameForUserAgent = Brand.userAgentSuffix
        config.allowsInlineMediaPlayback = true
        config.websiteDataStore = .default()

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = .systemBackground

        let refresh = UIRefreshControl()
        refresh.addTarget(context.coordinator, action: #selector(Coordinator.pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        context.coordinator.attach(to: webView)
        context.coordinator.load(url, in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.requestedURL != url {
            context.coordinator.load(url, in: webView)
        }
    }

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        coordinator.detach()
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        private(set) var requestedURL: URL?
        private weak var webView: WKWebView?
        private var urlObservation: NSKeyValueObservation?

        func attach(to webView: WKWebView) {
            self.webView = webView
            // Next.js changes routes with pushState, which never reaches the
            // navigation delegate, so also watch the URL property.
            urlObservation = webView.observe(\.url, options: [.new]) { view, _ in
                if let current = view.url {
                    Coordinator.inspect(current)
                }
            }
        }

        func detach() {
            urlObservation?.invalidate()
            urlObservation = nil
        }

        func load(_ url: URL, in webView: WKWebView) {
            requestedURL = url
            webView.load(URLRequest(url: url))
            Coordinator.inspect(url)
        }

        @objc func pullToRefresh(_ sender: UIRefreshControl) {
            webView?.reload()
        }

        nonisolated private static func inspect(_ url: URL) {
            if let ticketId = TicketSession.ticketId(from: url) {
                TicketSession.shared.start(ticketId: ticketId)
            }
        }

        nonisolated private static func isOurSite(_ url: URL) -> Bool {
            url.host?.lowercased() == Brand.host
        }

        nonisolated private static func openExternally(_ url: URL) {
            DispatchQueue.main.async {
                UIApplication.shared.open(url, options: [:], completionHandler: nil)
            }
        }

        // MARK: WKNavigationDelegate

        func webView(
            _ webView: WKWebView,
            decidePolicyFor navigationAction: WKNavigationAction,
            decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
        ) {
            guard let target = navigationAction.request.url else {
                decisionHandler(.allow)
                return
            }
            let scheme = target.scheme?.lowercased() ?? ""
            let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true

            if scheme == "http" || scheme == "https" {
                if isMainFrame && !Coordinator.isOurSite(target) {
                    Coordinator.openExternally(target)
                    decisionHandler(.cancel)
                    return
                }
                Coordinator.inspect(target)
                decisionHandler(.allow)
                return
            }

            if ["about", "blob", "data", "javascript"].contains(scheme) {
                decisionHandler(.allow)
                return
            }

            // tel:, mailto:, sms:, whatsapp:, maps: ...
            Coordinator.openExternally(target)
            decisionHandler(.cancel)
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.scrollView.refreshControl?.endRefreshing()
            if let current = webView.url {
                Coordinator.inspect(current)
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            webView.scrollView.refreshControl?.endRefreshing()
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            webView.reload()
        }

        // MARK: WKUIDelegate

        // target="_blank" / window.open: stay in this view for our site.
        func webView(
            _ webView: WKWebView,
            createWebViewWith configuration: WKWebViewConfiguration,
            for navigationAction: WKNavigationAction,
            windowFeatures: WKWindowFeatures
        ) -> WKWebView? {
            if navigationAction.targetFrame == nil, let target = navigationAction.request.url {
                if Coordinator.isOurSite(target) {
                    webView.load(URLRequest(url: target))
                } else {
                    Coordinator.openExternally(target)
                }
            }
            return nil
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptAlertPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping () -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
            if !Coordinator.present(alert, from: webView) {
                completionHandler()
            }
        }

        func webView(
            _ webView: WKWebView,
            runJavaScriptConfirmPanelWithMessage message: String,
            initiatedByFrame frame: WKFrameInfo,
            completionHandler: @escaping (Bool) -> Void
        ) {
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel · إلغاء", style: .cancel) { _ in completionHandler(false) })
            alert.addAction(UIAlertAction(title: "OK · موافق", style: .default) { _ in completionHandler(true) })
            if !Coordinator.present(alert, from: webView) {
                completionHandler(false)
            }
        }

        /// Presents on the top-most view controller. Returns false if there is none.
        private static func present(_ controller: UIViewController, from view: UIView) -> Bool {
            guard var top = view.window?.rootViewController else { return false }
            while let presented = top.presentedViewController {
                top = presented
            }
            top.present(controller, animated: true)
            return true
        }
    }
}
