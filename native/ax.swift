// Read-only, application-scoped macOS accessibility bridge. No event posting or AX actions.
import Foundation
import AppKit
import ApplicationServices
import CoreGraphics

func output(_ value: [String: Any]) {
    if let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]), let text = String(data: data, encoding: .utf8) { print(text) }
}
let trusted = AXIsProcessTrustedWithOptions([kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: false] as CFDictionary)
let command = CommandLine.arguments.dropFirst().first ?? "doctor"
if command == "doctor" {
    output(["platform": "macos", "accessibility": trusted ? "granted" : "not_granted", "screenRecording": CGPreflightScreenCaptureAccess() ? "granted" : "not_granted", "prompted": false, "readOnly": true])
    exit(0)
}
guard command == "observe", CommandLine.arguments.count == 3 else { output(["error": "invalid_command"]); exit(1) }
guard trusted else {
    output(["error": "accessibility_permission_required", "next": "Enable your launching terminal or agent host (or this helper, if macOS lists it) in System Settings > Privacy & Security > Accessibility, then restart that host and run doctor again. Screen Recording is not required for this AX-only reader."])
    exit(0)
}
let bundleId = CommandLine.arguments[2]
let apps = NSRunningApplication.runningApplications(withBundleIdentifier: bundleId)
guard apps.count == 1, let app = apps.first else { output(["error": "application_not_running_or_ambiguous", "bundleId": bundleId]); exit(0) }
let root = AXUIElementCreateApplication(app.processIdentifier)
AXUIElementSetMessagingTimeout(root, 0.2)
let deadline = Date().addingTimeInterval(3)
var reads = 0
var failedReads = 0
var truncated = false
func attribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    if Date() > deadline || reads >= 1800 { truncated = true; return nil }
    reads += 1
    var value: CFTypeRef?
    let result = AXUIElementCopyAttributeValue(element, name as CFString, &value)
    if result != .success && result != .attributeUnsupported && result != .noValue { failedReads += 1 }
    return result == .success ? value : nil
}
func text(_ v: CFTypeRef?, _ max: Int = 100) -> String {
    guard let s = v as? String else { return "" }
    return String(s.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").prefix(max))
}
// Only accept a real focused window. Some applications return an application
// proxy for AXFocusedWindow; resolve the focused window from their window list.
var focusedWindow: AXUIElement?
if let raw = attribute(root, kAXFocusedWindowAttribute), CFGetTypeID(raw) == AXUIElementGetTypeID() {
    let candidate = raw as! AXUIElement
    if text(attribute(candidate, kAXRoleAttribute)) == kAXWindowRole { focusedWindow = candidate }
}
if focusedWindow == nil {
    var count: CFIndex = 0
    if AXUIElementGetAttributeValueCount(root, kAXWindowsAttribute as CFString, &count) == .success && count > 0 {
        var raw: CFArray?
        if AXUIElementCopyAttributeValues(root, kAXWindowsAttribute as CFString, 0, min(count, 8), &raw) == .success,
           let windows = raw as? [AXUIElement] {
            let candidates = windows.filter { text(attribute($0, kAXRoleAttribute)) == kAXWindowRole && (attribute($0, kAXFocusedAttribute) as? Bool) == true }
            if candidates.count == 1 { focusedWindow = candidates[0] }
        }
    }
}
guard let window = focusedWindow else {
    output(["error": "focused_window_unavailable", "pid": app.processIdentifier, "bundleId": bundleId, "next": "The requested app did not expose a focused AXWindow. No application or menu tree was read. Focus its window and try again."]); exit(0)
}
var queue: [(AXUIElement, Int, String)] = [(window, 0, "")]
var cursor = 0
var nodes: [[String: Any]] = []
var seen = Set<AXUIElement>()
while cursor < queue.count && cursor < 200 && Date() < deadline && reads < 1800 {
    let (element, depth, context) = queue[cursor]; cursor += 1
    if seen.contains(element) { truncated = true; continue }
    seen.insert(element)
    AXUIElementSetMessagingTimeout(element, 0.2)
    let role = text(attribute(element, kAXRoleAttribute), 40)
    let subrole = text(attribute(element, kAXSubroleAttribute), 40)
    if subrole == kAXSecureTextFieldSubrole || role == kAXSecureTextFieldSubrole { continue }
    let title = text(attribute(element, kAXTitleAttribute))
    let description = text(attribute(element, kAXDescriptionAttribute))
    let rawValue = attribute(element, kAXValueAttribute)
    let value = text(rawValue, 160)
    let name = title.isEmpty ? description : title
    var record: [String: Any] = ["id": "a\(cursor)", "role": role, "name": name, "source": "macos-accessibility", "context": context]
    if !value.isEmpty { record["value"] = value }
    else if let number = rawValue as? NSNumber { record["value"] = number }
    var actions: CFArray?
    if AXUIElementCopyActionNames(element, &actions) == .success, let names = actions as? [String] { record["availableActions"] = Array(names.prefix(6)) }
    if let rawPosition = attribute(element, kAXPositionAttribute), CFGetTypeID(rawPosition) == AXValueGetTypeID(),
       let rawSize = attribute(element, kAXSizeAttribute), CFGetTypeID(rawSize) == AXValueGetTypeID() {
        var point = CGPoint.zero; var size = CGSize.zero
        let position = (rawPosition as! AXValue), dimensions = (rawSize as! AXValue)
        if AXValueGetType(position) == .cgPoint && AXValueGetType(dimensions) == .cgSize && AXValueGetValue(position, .cgPoint, &point) && AXValueGetValue(dimensions, .cgSize, &size) {
            record["bounds"] = ["x": point.x, "y": point.y, "width": size.width, "height": size.height]
        }
    }
    if let enabled = attribute(element, kAXEnabledAttribute) as? Bool { record["enabled"] = enabled }
    if let focused = attribute(element, kAXFocusedAttribute) as? Bool { record["focused"] = focused }
    if !name.isEmpty || !value.isEmpty { nodes.append(record) }
    if depth < 12 {
        // Bound child retrieval at the API, rather than materializing an entire application tree.
        var count: CFIndex = 0
        if AXUIElementGetAttributeValueCount(element, kAXChildrenAttribute as CFString, &count) == .success && count > 0 {
            let remaining = min(40, 200 - queue.count)
            if count > remaining { truncated = true }
            if remaining > 0 {
                var children: CFArray?
                if AXUIElementCopyAttributeValues(element, kAXChildrenAttribute as CFString, 0, min(count, remaining), &children) == .success,
                   let list = children as? [AXUIElement] {
                    let nextContext = [kAXWindowRole, kAXGroupRole, kAXToolbarRole].contains(role) && !name.isEmpty ? name : context
                    queue += list.map { ($0, depth + 1, nextContext) }
                }
            }
        }
    } else { truncated = true }
}
if cursor < queue.count || Date() >= deadline || reads >= 1800 { truncated = true }
output(["bundleId": bundleId, "application": app.localizedName ?? bundleId, "pid": app.processIdentifier,
        "source": "macos-accessibility", "readOnly": true, "nodes": nodes, "truncated": truncated, "failedReads": failedReads,
        "limits": "Focused window only; application-provided labels may be incomplete or untrusted. Secure text fields omitted. No pixels or desktop actions. IDs describe this snapshot only and cannot be passed to browser actions."])
