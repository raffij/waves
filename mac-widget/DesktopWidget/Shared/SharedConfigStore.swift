import Foundation
import Security

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
// a shared keychain-access-group. Both a shared keychain group and (on
// macOS) a shared App Group have to be team-id-namespaced at sign time; the
// difference is that the app-group entitlement can be read straight back out
// of our own signature at runtime (see resolveAppGroupId), so we don't have
// to bake a team id into the repo. The cost is the value sitting in a plist
// rather than the Keychain — acceptable here since the TideCheck key only
// grants read access to public tide data.
private let configKey = "widgetConfig"

// The App Group container id. On iOS a bare "group."-prefixed id works, but a
// sandboxed macOS process only gets a *shared* container when the id is
// namespaced by the team identifier; with a bare id, UserDefaults(suiteName:)
// silently returns a private per-process suite, so the widget never sees what
// SettingsView wrote and just shows the "open Wave Hastings" placeholder
// forever. project.yml declares the entitlement as
// "$(TeamIdentifierPrefix)group.com.anonymous.hastings-tide", expanded to the
// real team id at sign time; we recover that same fully-qualified string at
// runtime from our own signed entitlements rather than committing a team id.
private let appGroupId: String = resolveAppGroupId()

private func resolveAppGroupId() -> String {
    let bareId = "group.com.anonymous.hastings-tide"

    var code: SecCode?
    guard SecCodeCopySelf(SecCSFlags(rawValue: 0), &code) == errSecSuccess,
          let code else { return bareId }

    var staticCode: SecStaticCode?
    guard SecCodeCopyStaticCode(code, SecCSFlags(rawValue: 0), &staticCode) == errSecSuccess,
          let staticCode else { return bareId }

    var info: CFDictionary?
    guard SecCodeCopySigningInformation(
              staticCode,
              SecCSFlags(rawValue: UInt32(kSecCSRequirementInformation)),
              &info
          ) == errSecSuccess,
          let signing = info as? [String: Any],
          let entitlements = signing[kSecCodeInfoEntitlementsDict as String] as? [String: Any],
          let groups = entitlements["com.apple.security.application-groups"] as? [String]
    else { return bareId }

    return groups.first { $0.hasSuffix(bareId) } ?? groups.first ?? bareId
}

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
