import SwiftUI
import WidgetKit

struct WaveHastingsWidget: Widget {
    let kind: String = "WaveHastingsDesktopWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            WaveWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Tide, Wave & Wind")
        .description("Current conditions and the next tide, from Wave Hastings.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

@main
struct WaveHastingsWidgetBundle: WidgetBundle {
    var body: some Widget {
        WaveHastingsWidget()
    }
}
