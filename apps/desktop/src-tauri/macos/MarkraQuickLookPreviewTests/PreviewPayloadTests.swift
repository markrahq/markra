import Foundation

enum PreviewPayloadTests {
    static func run() throws {
        let payload = PreviewPayload(
            appearance: "dark",
            fileName: "mock.md",
            markdown: "# Synthetic preview"
        )
        let arguments = payload.bridgeArguments

        try expect(arguments["appearance"] as? String == "dark", "appearance should cross the bridge")
        try expect(arguments["fileName"] as? String == "mock.md", "file name should cross the bridge")
        try expect(
            arguments["markdown"] as? String == "# Synthetic preview",
            "Markdown should cross the bridge without JavaScript string interpolation"
        )
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) throws {
        if !condition() {
            throw PreviewPayloadTestFailure(message: message)
        }
    }
}

private struct PreviewPayloadTestFailure: Error, CustomStringConvertible {
    let message: String

    var description: String { message }
}
