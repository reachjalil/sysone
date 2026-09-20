import AppKit
final class FixtureDelegate: NSObject, NSApplicationDelegate {
    var window: NSWindow!
    func applicationDidFinishLaunching(_ notification: Notification) {
        window = NSWindow(contentRect: NSRect(x: 80, y: 80, width: 420, height: 180), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "System One AX test fixture"
        window.isReleasedWhenClosed = false
        let label = NSTextField(labelWithString: "Dedicated accessibility test window")
        label.frame = NSRect(x: 20, y: 135, width: 370, height: 24)
        let field = NSTextField(frame: NSRect(x: 20, y: 90, width: 220, height: 24))
        field.stringValue = "Aurora"
        field.setAccessibilityLabel("Project name")
        let secret = NSSecureTextField(frame: NSRect(x: 20, y: 50, width: 220, height: 24))
        secret.stringValue = "never-export-native-secret"
        let button = NSButton(title: "Save preview", target: self, action: #selector(save))
        button.frame = NSRect(x: 250, y: 90, width: 140, height: 28)
        for view in [label, field, secret, button] { window.contentView?.addSubview(view) }
        window.setAccessibilityElement(true)
        window.makeKeyAndOrderFront(nil)
        window.makeMain()
        NSApp.setAccessibilityFocusedWindow(window)
        NSApp.setAccessibilityMainWindow(window)
        NSApp.setAccessibilityWindows([window])
        NSApp.activate(ignoringOtherApps: true)
        DispatchQueue.main.asyncAfter(deadline: .now() + 10) { NSApp.terminate(nil) }
    }
    @objc func save() {}
}
let app = NSApplication.shared
let delegate = FixtureDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
withExtendedLifetime(delegate) { app.run() }
