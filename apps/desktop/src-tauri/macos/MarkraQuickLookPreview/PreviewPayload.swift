import Foundation

struct PreviewPayload {
    let appearance: String
    let fileName: String
    let markdown: String

    var bridgeArguments: [String: Any] {
        [
            "appearance": appearance,
            "fileName": fileName,
            "markdown": markdown,
        ]
    }
}
