import SwiftUI
import WidgetKit

extension View {
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(macOS 14.0, *) {
            containerBackground(Color(red: 0.01, green: 0.07, blue: 0.17), for: .widget)
        } else {
            background(Color(red: 0.01, green: 0.07, blue: 0.17))
        }
    }
}

private struct NeedsSetupView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "water.waves")
                .font(.title2)
                .foregroundStyle(.white)
            Text("Open Wave Hastings and add your TideCheck API key")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.7))
        }
        .padding()
    }
}

private struct ConditionRow: View {
    let icon: String
    let label: String
    let value: String
    let trend: Trend

    var body: some View {
        HStack {
            Label(label, systemImage: icon)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))
            Spacer()
            Text("\(value) \(trend.arrow)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white)
        }
    }
}

private struct SmallView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(snapshot.locationName)
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.7))
                .lineLimit(1)

            Text(snapshot.tideHeight.map { String(format: "%.1fm", $0) } ?? "—")
                .font(.system(size: 28, weight: .semibold))
                .foregroundStyle(.white)
            Text("Tide \(snapshot.tideTrend.arrow)")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.7))

            Spacer(minLength: 0)

            if let extreme = snapshot.nextExtreme {
                Text(String(format: "%@ %.1fm at %@", extreme.label, extreme.height, extreme.time))
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.7))
                    .lineLimit(1)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

private struct MediumView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        HStack(alignment: .top) {
            VStack(alignment: .leading, spacing: 4) {
                Text(snapshot.locationName)
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.7))
                Text(snapshot.tideHeight.map { String(format: "%.1fm", $0) } ?? "—")
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(.white)
                Text("Tide \(snapshot.tideTrend.arrow)")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
            }

            Spacer()

            VStack(alignment: .leading, spacing: 8) {
                if let wave = snapshot.waveHeight {
                    ConditionRow(icon: "water.waves", label: "Wave", value: String(format: "%.1fm", wave), trend: snapshot.waveTrend)
                }
                if let wind = snapshot.windSpeed {
                    ConditionRow(icon: "wind", label: "Wind", value: String(format: "%.0f mph", wind), trend: snapshot.windTrend)
                }
                if let extreme = snapshot.nextExtreme {
                    Text(String(format: "%@ %.1fm at %@", extreme.label, extreme.height, extreme.time))
                        .font(.caption2)
                        .foregroundStyle(.white.opacity(0.7))
                }
            }
            .frame(maxWidth: 160, alignment: .leading)
        }
        .padding()
    }
}

private struct LargeView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text(snapshot.locationName)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))

            Text(snapshot.tideHeight.map { String(format: "%.1fm", $0) } ?? "—")
                .font(.system(size: 44, weight: .semibold))
                .foregroundStyle(.white)
            Text("Tide \(snapshot.tideTrend.arrow)")
                .font(.caption)
                .foregroundStyle(.white.opacity(0.7))

            Divider().overlay(.white.opacity(0.2))

            if let wave = snapshot.waveHeight {
                ConditionRow(icon: "water.waves", label: "Wave", value: String(format: "%.1fm", wave), trend: snapshot.waveTrend)
            }
            if let wind = snapshot.windSpeed {
                ConditionRow(icon: "wind", label: "Wind", value: String(format: "%.0f mph", wind), trend: snapshot.windTrend)
            }
            if let extreme = snapshot.nextExtreme {
                ConditionRow(icon: "clock", label: "Next \(extreme.label.lowercased())", value: String(format: "%.1fm at %@", extreme.height, extreme.time), trend: .unknown)
            }

            Spacer(minLength: 0)

            Text("Updated \(TideClock.format(snapshot.fetchedAt, as: "HH:mm"))")
                .font(.caption2)
                .foregroundStyle(.white.opacity(0.5))
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct WaveWidgetEntryView: View {
    var entry: Provider.Entry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        Group {
            if !entry.hasConfig {
                NeedsSetupView()
            } else if let snapshot = entry.snapshot {
                switch family {
                case .systemSmall:
                    SmallView(snapshot: snapshot)
                case .systemLarge:
                    LargeView(snapshot: snapshot)
                default:
                    MediumView(snapshot: snapshot)
                }
            } else {
                Text("Couldn't load tide data")
                    .font(.caption)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.7))
                    .padding()
            }
        }
        .widgetBackground()
    }
}
