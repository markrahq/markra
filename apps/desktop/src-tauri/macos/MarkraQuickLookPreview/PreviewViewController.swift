import Cocoa
import OSLog
import QuickLookUI
import WebKit

private let previewLogger = Logger(
    subsystem: "dev.markra.app.quicklook",
    category: "preview"
)

@objc(PreviewViewController)
final class PreviewViewController: NSViewController, QLPreviewingController, WKNavigationDelegate {
    private var pendingPayload: [String: Any]?
    private var webView: WKWebView!

    override func loadView() {
        previewLogger.info("Creating Quick Look preview view")
        let rootView = NSView()
        rootView.wantsLayer = true
        rootView.layer?.backgroundColor = NSColor.textBackgroundColor.cgColor

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .nonPersistent()

        let previewWebView = WKWebView(frame: .zero, configuration: configuration)
        previewWebView.navigationDelegate = self
        previewWebView.translatesAutoresizingMaskIntoConstraints = false
        rootView.addSubview(previewWebView)

        NSLayoutConstraint.activate([
            previewWebView.leadingAnchor.constraint(equalTo: rootView.leadingAnchor),
            previewWebView.trailingAnchor.constraint(equalTo: rootView.trailingAnchor),
            previewWebView.topAnchor.constraint(equalTo: rootView.topAnchor),
            previewWebView.bottomAnchor.constraint(equalTo: rootView.bottomAnchor),
        ])

        webView = previewWebView
        view = rootView
    }

    @MainActor
    func preparePreviewOfFile(at url: URL) async throws {
        previewLogger.info("Preparing Markdown preview")
        do {
            try loadMarkdownPreview(for: url)
            previewLogger.info("Submitted renderer navigation")
        } catch {
            previewLogger.error("Preview preparation failed: \(String(describing: error), privacy: .public)")
            pendingPayload = nil
            loadErrorPreview(error)
        }
    }

    private func loadMarkdownPreview(for documentURL: URL) throws {
        let markdown = try String(contentsOf: documentURL, encoding: .utf8)

        guard let rendererRootURL = Bundle.main.resourceURL?
            .appendingPathComponent("quicklook-renderer", isDirectory: true) else {
            throw PreviewError.rendererMissing
        }
        let rendererIndexURL = rendererRootURL
            .appendingPathComponent("src/quicklook/index.html", isDirectory: false)
        guard FileManager.default.fileExists(atPath: rendererIndexURL.path) else {
            throw PreviewError.rendererMissing
        }

        pendingPayload = PreviewPayload(
            appearance: effectiveAppearanceName(),
            fileName: documentURL.lastPathComponent,
            markdown: markdown
        ).bridgeArguments

        guard webView.loadFileURL(rendererIndexURL, allowingReadAccessTo: rendererRootURL) != nil else {
            pendingPayload = nil
            throw PreviewError.rendererNavigationFailed
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        previewLogger.info("Quick Look renderer navigation finished")
        guard let payload = pendingPayload else { return }
        pendingPayload = nil

        webView.callAsyncJavaScript(
            """
            if (typeof window.__MARKRA_RENDER_QUICKLOOK__ !== 'function') {
              throw new Error('Quick Look renderer bridge is unavailable');
            }
            return window.__MARKRA_RENDER_QUICKLOOK__(payload);
            """,
            arguments: ["payload": payload],
            in: nil,
            in: .page
        ) { [weak self] result in
            switch result {
            case .success:
                previewLogger.info("Delivered Markdown payload to renderer")
            case let .failure(error):
                previewLogger.error("Renderer bridge failed: \(String(describing: error), privacy: .public)")
                self?.pendingPayload = nil
                self?.loadErrorPreview(error)
            }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        previewLogger.error("Renderer navigation failed: \(String(describing: error), privacy: .public)")
        pendingPayload = nil
        loadErrorPreview(error)
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        previewLogger.error("Renderer provisional navigation failed: \(String(describing: error), privacy: .public)")
        pendingPayload = nil
        loadErrorPreview(error)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        decisionHandler(navigationAction.navigationType == .linkActivated ? .cancel : .allow)
    }

    private func effectiveAppearanceName() -> String {
        view.effectiveAppearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            ? "dark"
            : "light"
    }

    private func loadErrorPreview(_ error: Error) {
        let message = htmlEscape(errorMessage(for: error))
        webView.loadHTMLString(
            """
            <!doctype html>
            <html lang="en">
              <head><meta charset="utf-8"></head>
              <body style="margin:0;display:grid;min-height:100vh;place-items:center;font:14px -apple-system,BlinkMacSystemFont,sans-serif;color:#68707a;background:#fff;">
                <main style="display:grid;gap:8px;text-align:center;padding:24px;">
                  <strong style="color:#202428;font-size:16px;">Unable to generate Markra preview</strong>
                  <span>\(message)</span>
                </main>
              </body>
            </html>
            """,
            baseURL: nil
        )
    }

    private func errorMessage(for error: Error) -> String {
        if let previewError = error as? PreviewError {
            return previewError.description
        }
        if error is CocoaError {
            return "The Markdown file could not be read as UTF-8"
        }
        return "The preview renderer could not be loaded"
    }
}

private enum PreviewError: Error, CustomStringConvertible {
    case rendererMissing
    case rendererNavigationFailed

    var description: String {
        switch self {
        case .rendererMissing:
            return "Quick Look renderer resources are missing"
        case .rendererNavigationFailed:
            return "Quick Look renderer navigation failed"
        }
    }
}

private func htmlEscape(_ value: String) -> String {
    value
        .replacingOccurrences(of: "&", with: "&amp;")
        .replacingOccurrences(of: "<", with: "&lt;")
        .replacingOccurrences(of: ">", with: "&gt;")
        .replacingOccurrences(of: "\"", with: "&quot;")
}
