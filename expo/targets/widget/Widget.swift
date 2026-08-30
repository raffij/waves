import SwiftUI
import WidgetKit

// MARK: - Shared config, written by the app via modules/widget-bridge into
// the App Group's UserDefaults whenever the API key or location changes.
// See expo/src/services/WidgetSync.ts for the app-side half of this.

private let appGroupId = "group.com.anonymous.hastings-tide"
private let widgetConfigKey = "widgetConfig"

struct WidgetConfig: Decodable {
    let apiKey: String
    let stationId: String
    let latitude: String
    let longitude: String
    let locationName: String
}

enum SharedConfigStore {
    static func read() -> WidgetConfig? {
        guard let defaults = UserDefaults(suiteName: appGroupId),
              let json = defaults.string(forKey: widgetConfigKey),
              let data = json.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(WidgetConfig.self, from: data)
    }
}

// MARK: - Data models (mirrors mac-widget/wave-hastings.15m.swift)

struct TideResponse: Decodable {
    struct Extreme: Decodable {
        let localTime: String
        let localDate: String
        let height: Double
        let type: String
    }
    struct SeriesPoint: Decodable {
        let time: String
        let height: Double
    }
    let extremes: [Extreme]
    let timeSeries: [SeriesPoint]
}

struct MarineResponse: Decodable {
    struct Hourly: Decodable {
        let time: [String]
        let wave_height: [Double?]
    }
    let hourly: Hourly
}

struct ForecastResponse: Decodable {
    struct Hourly: Decodable {
        let time: [String]
        let wind_speed_10m: [Double?]
    }
    let hourly: Hourly
}

// MARK: - Shared date handling

enum TideClock {
    static let londonTZ = TimeZone(identifier: "Europe/London")!

    private static let localDateTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd'T'HH:mm"
        formatter.timeZone = londonTZ
        formatter.locale = Locale(identifier: "en_US_POSIX")
        return formatter
    }()

    static func parseISODate(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: string) { return date }
        // Open-Meteo's hourly timestamps come back local-naive with no
        // offset/Z, so fall back to a local parser (see the mac-widget
        // script's identical comment for why).
        return localDateTimeFormatter.date(from: string)
    }

    static func format(_ date: Date, as pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = pattern
        formatter.timeZone = londonTZ
        return formatter.string(from: date)
    }
}

enum Trend: String {
    case rising, falling, steady, unknown

    var arrow: String {
        switch self {
        case .rising: return "↑"
        case .falling: return "↓"
        case .steady: return "–"
        case .unknown: return "?"
        }
    }
}

// MARK: - Value series: current-value/trend by linear interpolation

final class ValueSeries {
    private let points: [(Date, Double)]
    private let steadyThreshold: Double

    init(times: [String], values: [Double?], steadyThreshold: Double) {
        points = zip(times, values).compactMap { time, value in
            guard let value = value, let date = TideClock.parseISODate(time) else { return nil }
            return (date, value)
        }.sorted { $0.0 < $1.0 }
        self.steadyThreshold = steadyThreshold
    }

    private func neighbors(of date: Date) -> (before: (Date, Double)?, after: (Date, Double)?) {
        var before: (Date, Double)?
        var after: (Date, Double)?
        for point in points {
            if point.0 <= date { before = point }
            if point.0 > date && after == nil { after = point }
        }
        return (before, after)
    }

    func value(at date: Date) -> Double? {
        let (before, after) = neighbors(of: date)
        if let before = before, let after = after {
            let total = after.0.timeIntervalSince(before.0)
            let elapsed = date.timeIntervalSince(before.0)
            let fraction = total > 0 ? elapsed / total : 0
            return before.1 + (after.1 - before.1) * fraction
        }
        return before?.1 ?? after?.1
    }

    func trend(at date: Date) -> Trend {
        guard let now = value(at: date), let past = value(at: date.addingTimeInterval(-3600)) else { return .unknown }
        let diff = now - past
        if abs(diff) < steadyThreshold { return .steady }
        return diff > 0 ? .rising : .falling
    }
}

// MARK: - Networking

private func fetchJSON<T: Decodable>(_ url: URL, headers: [String: String] = [:], as type: T.Type) async -> T? {
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
    guard let (data, response) = try? await URLSession.shared.data(for: request),
          let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
}

// MARK: - Widget snapshot: everything one timeline entry needs to render

struct WidgetSnapshot {
    let locationName: String
    let tideHeight: Double?
    let tideTrend: Trend
    let nextExtreme: (label: String, height: Double, time: String)?
    let waveHeight: Double?
    let waveTrend: Trend
    let windSpeed: Double?
    let windTrend: Trend
    let fetchedAt: Date

    static var placeholder: WidgetSnapshot {
        WidgetSnapshot(
            locationName: "Hastings Pier",
            tideHeight: 2.4, tideTrend: .rising,
            nextExtreme: ("High", 4.1, "14:32"),
            waveHeight: 0.6, waveTrend: .steady,
            windSpeed: 11, windTrend: .falling,
            fetchedAt: Date()
        )
    }
}

// Fetches tide, wave and wind fresh on every timeline reload — the widget
// has no disk cache of its own (unlike the app and the macOS menu-bar
// script), since WidgetKit already throttles reloads to roughly hourly.
enum WaveHastingsFetcher {
    static func loadSnapshot(config: WidgetConfig) async -> WidgetSnapshot? {
        let tideURL = URL(string: "https://tidecheck.com/api/station/\(config.stationId)/tides")!
        guard let tideData = await fetchJSON(tideURL, headers: ["X-API-Key": config.apiKey], as: TideResponse.self) else {
            return nil
        }

        let now = Date()
        let startDate = TideClock.format(now.addingTimeInterval(-86_400), as: "yyyy-MM-dd")
        let endDate = TideClock.format(now.addingTimeInterval(2 * 86_400), as: "yyyy-MM-dd")

        var marineComponents = URLComponents(string: "https://marine-api.open-meteo.com/v1/marine")!
        marineComponents.queryItems = [
            URLQueryItem(name: "latitude", value: config.latitude),
            URLQueryItem(name: "longitude", value: config.longitude),
            URLQueryItem(name: "start_date", value: startDate),
            URLQueryItem(name: "end_date", value: endDate),
            URLQueryItem(name: "hourly", value: "wave_height"),
            URLQueryItem(name: "timezone", value: "Europe/London"),
        ]
        let marine = await fetchJSON(marineComponents.url!, as: MarineResponse.self)

        var forecastComponents = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        forecastComponents.queryItems = [
            URLQueryItem(name: "latitude", value: config.latitude),
            URLQueryItem(name: "longitude", value: config.longitude),
            URLQueryItem(name: "start_date", value: startDate),
            URLQueryItem(name: "end_date", value: endDate),
            URLQueryItem(name: "hourly", value: "wind_speed_10m"),
            URLQueryItem(name: "wind_speed_unit", value: "mph"),
            URLQueryItem(name: "timezone", value: "Europe/London"),
        ]
        let forecast = await fetchJSON(forecastComponents.url!, as: ForecastResponse.self)

        let tideSeries = ValueSeries(
            times: tideData.timeSeries.map { $0.time },
            values: tideData.timeSeries.map { $0.height },
            steadyThreshold: 0.02
        )
        let waveSeries = marine.map { ValueSeries(times: $0.hourly.time, values: $0.hourly.wave_height, steadyThreshold: 0.05) }
        let windSeries = forecast.map { ValueSeries(times: $0.hourly.time, values: $0.hourly.wind_speed_10m, steadyThreshold: 0.7) }

        let nextExtreme = tideData.extremes
            .compactMap { extreme -> (String, Double, String, Date)? in
                guard let date = TideClock.parseISODate(extreme.localTime), date >= now else { return nil }
                let label = extreme.type == "high" ? "High" : "Low"
                return (label, extreme.height, TideClock.format(date, as: "HH:mm"), date)
            }
            .sorted { $0.3 < $1.3 }
            .first
            .map { (label: $0.0, height: $0.1, time: $0.2) }

        return WidgetSnapshot(
            locationName: config.locationName,
            tideHeight: tideSeries.value(at: now),
            tideTrend: tideSeries.trend(at: now),
            nextExtreme: nextExtreme,
            waveHeight: waveSeries?.value(at: now),
            waveTrend: waveSeries?.trend(at: now) ?? .unknown,
            windSpeed: windSeries?.value(at: now),
            windTrend: windSeries?.trend(at: now) ?? .unknown,
            fetchedAt: now
        )
    }
}

// MARK: - Timeline provider

struct SimpleEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let hasConfig: Bool
}

struct Provider: TimelineProvider {
    func placeholder(in context: Context) -> SimpleEntry {
        SimpleEntry(date: Date(), snapshot: .placeholder, hasConfig: true)
    }

    func getSnapshot(in context: Context, completion: @escaping (SimpleEntry) -> Void) {
        completion(SimpleEntry(date: Date(), snapshot: .placeholder, hasConfig: true))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SimpleEntry>) -> Void) {
        guard let config = SharedConfigStore.read() else {
            let entry = SimpleEntry(date: Date(), snapshot: nil, hasConfig: false)
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
            return
        }

        Task {
            let snapshot = await WaveHastingsFetcher.loadSnapshot(config: config)
            let entry = SimpleEntry(date: Date(), snapshot: snapshot, hasConfig: true)
            // Roughly hourly is plenty for tide/wave conditions, and gentle
            // on TideCheck's 50-requests/day free tier.
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 60))))
        }
    }
}

// MARK: - Views

private extension View {
    @ViewBuilder
    func widgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(Color("WidgetBackground"), for: .widget)
        } else {
            background(Color("WidgetBackground"))
        }
    }
}

private struct NeedsSetupView: View {
    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: "water.waves")
                .font(.title2)
            Text("Open Wave Hastings and add your TideCheck API key")
                .font(.caption)
                .multilineTextAlignment(.center)
                .foregroundStyle(.secondary)
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
                .foregroundStyle(.secondary)
            Spacer()
            Text("\(value) \(trend.arrow)")
                .font(.caption.weight(.semibold))
        }
    }
}

private struct SmallView: View {
    let snapshot: WidgetSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(snapshot.locationName)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(1)

            if let height = snapshot.tideHeight {
                Text(String(format: "%.1fm", height))
                    .font(.system(size: 30, weight: .semibold))
                Text("Tide \(snapshot.tideTrend.arrow)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text("—")
                    .font(.system(size: 30, weight: .semibold))
            }

            Spacer(minLength: 0)

            if let extreme = snapshot.nextExtreme {
                Text(String(format: "%@ %.1fm at %@", extreme.label, extreme.height, extreme.time))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
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
                    .foregroundStyle(.secondary)
                Text(snapshot.tideHeight.map { String(format: "%.1fm", $0) } ?? "—")
                    .font(.system(size: 34, weight: .semibold))
                Text("Tide \(snapshot.tideTrend.arrow)")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
                        .foregroundStyle(.secondary)
                }
            }
            .frame(maxWidth: 150, alignment: .leading)
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
                .foregroundStyle(.secondary)

            Text(snapshot.tideHeight.map { String(format: "%.1fm", $0) } ?? "—")
                .font(.system(size: 44, weight: .semibold))
            Text("Tide \(snapshot.tideTrend.arrow)")
                .font(.caption)
                .foregroundStyle(.secondary)

            Divider()

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
                .foregroundStyle(.secondary)
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
                    .foregroundStyle(.secondary)
                    .padding()
            }
        }
        .widgetBackground()
        .widgetURL(URL(string: "hastings-tide://"))
    }
}

// MARK: - Widget definition

struct WaveHastingsWidget: Widget {
    let kind: String = "WaveHastingsWidget"

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
