import Foundation

// The widget extension runs in its own sandboxed process, separate from the
// host app, so the API key/location it needs has to cross via the shared
// App Group container rather than in-memory state. The host app's
// SettingsView writes here; Widget/Provider.swift reads it on every
// timeline reload.
//
// This stores the key in the App Group's UserDefaults rather than Keychain,
// unlike mac-widget/wave-hastings.15m.swift's `security`-CLI approach — that
// script isn't sandboxed, so it can read the ordinary login keychain
// directly, but a sandboxed widget extension can only see keychain items in
// a shared keychain-access-group, which needs the Xcode-managed
// $(AppIdentifierPrefix) to resolve correctly at sign time. UserDefaults
// sharing via an App Group avoids that footgun at the cost of the value
// sitting in a plist rather than the Keychain — acceptable here since the
// TideCheck key only grants read access to public tide data.
private let appGroupId = "group.com.anonymous.hastings-tide"
private let configKey = "widgetConfig"

struct DesktopWidgetConfig: Codable {
    let apiKey: String
    let location: DesktopLocation
}

enum SharedConfigStore {
    static func read() -> DesktopWidgetConfig? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let data = defaults.data(forKey: configKey) else { return nil }
        return try? JSONDecoder().decode(DesktopWidgetConfig.self, from: data)
    }

    static func write(apiKey: String, location: DesktopLocation) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        let config = DesktopWidgetConfig(apiKey: apiKey, location: location)
        guard let data = try? JSONEncoder().encode(config) else { return }
        defaults.set(data, forKey: configKey)
    }
}
