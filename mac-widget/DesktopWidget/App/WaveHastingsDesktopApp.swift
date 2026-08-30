import SwiftUI

@main
struct WaveHastingsDesktopApp: App {
    var body: some Scene {
        WindowGroup {
            SettingsView()
                .frame(minWidth: 380, minHeight: 260)
        }
        .windowResizability(.contentSize)
    }
}
