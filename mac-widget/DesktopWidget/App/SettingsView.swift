import SwiftUI
import WidgetKit

// The widget extension can't present any input UI of its own, so this
// window is the only way to give it an API key and location — it writes
// both into the shared App Group (see Shared/SharedConfigStore.swift) and
// asks WidgetKit to reload.
struct SettingsView: View {
    @State private var apiKey: String
    @State private var location: DesktopLocation
    @State private var justSaved = false

    init() {
        let existing = SharedConfigStore.read()
        _apiKey = State(initialValue: existing?.apiKey ?? "")
        _location = State(initialValue: existing?.location ?? .hastings)
    }

    var body: some View {
        Form {
            Section("TideCheck API key") {
                SecureField("API key", text: $apiKey)
            }

            Section("Location") {
                Picker("Location", selection: $location) {
                    ForEach(DesktopLocation.allCases) { candidate in
                        Text(candidate.displayName).tag(candidate)
                    }
                }
                .pickerStyle(.radioGroup)
            }

            Section {
                Button("Save") {
                    SharedConfigStore.write(apiKey: apiKey, location: location)
                    WidgetCenter.shared.reloadAllTimelines()
                    justSaved = true
                }
                .disabled(apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)

                if justSaved {
                    Text("Saved. Right-click the desktop and choose Edit Widgets to add Wave Hastings if you haven't already.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .navigationTitle("Wave Hastings")
    }
}
