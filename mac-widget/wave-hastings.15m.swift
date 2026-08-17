#!/usr/bin/swift

// <xbar.title>Hastings Tide Level</xbar.title>
// <xbar.version>4.0</xbar.version>
// <xbar.author>Raffi</xbar.author>
// <xbar.desc>Shows current tide, wave and wind conditions in Hastings, UK, with a 5-day forecast, via TideCheck and Open-Meteo.</xbar.desc>
// <xbar.dependencies>swift</xbar.dependencies>

import Foundation

// MARK: - Data models

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

    // Local-naive "yyyy-MM-dd'T'HH:mm" parser, lazily built once (DateFormatter
    // construction isn't free) and reused across every wave/wind timestamp.
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
        // Open-Meteo's hourly timestamps, requested with timezone=Europe/London,
        // come back local-naive with no offset/Z (e.g. "2026-08-16T00:00") —
        // ISO8601DateFormatter requires one, so fall back to a local parser.
        return localDateTimeFormatter.date(from: string)
    }

    static func format(_ date: Date, as pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = pattern
        formatter.timeZone = londonTZ
        return formatter.string(from: date)
    }
}

// MARK: - Trend

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

// MARK: - Keychain access

final class Keychain {
    let service: String

    init(service: String) {
        self.service = service
    }

    func readPassword() -> String? {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/security")
        process.arguments = ["find-generic-password", "-a", NSUserName(), "-s", service, "-w"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return nil
        }

        guard process.terminationStatus == 0 else { return nil }
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        return String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

// MARK: - Synchronous fetch helper

func fetchSync(_ request: URLRequest) -> Data? {
    var result: Data?
    let semaphore = DispatchSemaphore(value: 0)
    URLSession.shared.dataTask(with: request) { data, response, _ in
        defer { semaphore.signal() }
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return }
        result = data
    }.resume()
    _ = semaphore.wait(timeout: .now() + 10)
    return result
}

// MARK: - Tide API client with disk cache

final class TideAPIClient {
    let stationId: String
    let apiKey: String
    let cacheMaxAge: TimeInterval
    let cacheURL: URL

    // The free tier allows 50 requests/day. Refreshing every 15 min (this
    // plugin's interval) would be 96/day, so cache the response and only
    // re-fetch a few times a day; the cached timeSeries already spans ~10
    // days at 15-min resolution, which is plenty to interpolate between.
    init(stationId: String, apiKey: String, cacheMaxAge: TimeInterval = 6 * 60 * 60) {
        self.stationId = stationId
        self.apiKey = apiKey
        self.cacheMaxAge = cacheMaxAge

        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
            .appendingPathComponent("wave-hastings", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        cacheURL = base.appendingPathComponent("tides.json")
    }

    var cacheModificationDate: Date? {
        (try? FileManager.default.attributesOfItem(atPath: cacheURL.path))?[.modificationDate] as? Date
    }

    func loadTideData() -> TideResponse? {
        if let modDate = cacheModificationDate, Date().timeIntervalSince(modDate) < cacheMaxAge,
           let cached = try? Data(contentsOf: cacheURL),
           let decoded = try? JSONDecoder().decode(TideResponse.self, from: cached) {
            return decoded
        }

        if let fresh = fetchFromNetwork(), let decoded = try? JSONDecoder().decode(TideResponse.self, from: fresh) {
            try? fresh.write(to: cacheURL)
            return decoded
        }

        // Network/API failure: fall back to a stale cache rather than showing nothing.
        if let cached = try? Data(contentsOf: cacheURL) {
            return try? JSONDecoder().decode(TideResponse.self, from: cached)
        }

        return nil
    }

    private func fetchFromNetwork() -> Data? {
        let url = URL(string: "https://tidecheck.com/api/station/\(stationId)/tides")!
        var request = URLRequest(url: url)
        request.setValue(apiKey, forHTTPHeaderField: "X-API-Key")
        request.timeoutInterval = 8
        return fetchSync(request)
    }
}

// MARK: - Wave/wind API client with disk cache

struct WaveWindData: Codable {
    let waveTime: [String]
    let waveHeight: [Double?]
    let windTime: [String]?
    let windSpeed: [Double?]?
}

final class WaveAPIClient {
    let cacheMaxAge: TimeInterval
    let cacheURL: URL
    static let latitude = "50.86"
    static let longitude = "0.60"

    init(cacheMaxAge: TimeInterval = 6 * 60 * 60) {
        self.cacheMaxAge = cacheMaxAge
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first!
            .appendingPathComponent("wave-hastings", isDirectory: true)
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        cacheURL = base.appendingPathComponent("wave.json")
    }

    var cacheModificationDate: Date? {
        (try? FileManager.default.attributesOfItem(atPath: cacheURL.path))?[.modificationDate] as? Date
    }

    func loadWaveWindData() -> WaveWindData? {
        if let modDate = cacheModificationDate, Date().timeIntervalSince(modDate) < cacheMaxAge,
           let cached = try? Data(contentsOf: cacheURL),
           let decoded = try? JSONDecoder().decode(WaveWindData.self, from: cached) {
            return decoded
        }

        if let fresh = fetchFromNetwork() {
            try? (try? JSONEncoder().encode(fresh))?.write(to: cacheURL)
            return fresh
        }

        if let cached = try? Data(contentsOf: cacheURL) {
            return try? JSONDecoder().decode(WaveWindData.self, from: cached)
        }

        return nil
    }

    // Wave is essential; wind is a nice-to-have fetched independently, so a
    // wind failure never takes wave data down with it.
    private func fetchFromNetwork() -> WaveWindData? {
        let now = Date()
        let startDate = TideClock.format(now.addingTimeInterval(-86_400), as: "yyyy-MM-dd")
        let endDate = TideClock.format(now.addingTimeInterval(5 * 86_400), as: "yyyy-MM-dd")

        var marineComponents = URLComponents(string: "https://marine-api.open-meteo.com/v1/marine")!
        marineComponents.queryItems = [
            URLQueryItem(name: "latitude", value: Self.latitude),
            URLQueryItem(name: "longitude", value: Self.longitude),
            URLQueryItem(name: "start_date", value: startDate),
            URLQueryItem(name: "end_date", value: endDate),
            URLQueryItem(name: "hourly", value: "wave_height"),
            URLQueryItem(name: "timezone", value: "Europe/London"),
        ]
        guard let marineData = fetchSync(URLRequest(url: marineComponents.url!)),
              let marine = try? JSONDecoder().decode(MarineResponse.self, from: marineData) else {
            return nil
        }

        var windTime: [String]?
        var windSpeed: [Double?]?
        var forecastComponents = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        forecastComponents.queryItems = [
            URLQueryItem(name: "latitude", value: Self.latitude),
            URLQueryItem(name: "longitude", value: Self.longitude),
            URLQueryItem(name: "start_date", value: startDate),
            URLQueryItem(name: "end_date", value: endDate),
            URLQueryItem(name: "hourly", value: "wind_speed_10m"),
            URLQueryItem(name: "wind_speed_unit", value: "ms"),
            URLQueryItem(name: "timezone", value: "Europe/London"),
        ]
        if let forecastData = fetchSync(URLRequest(url: forecastComponents.url!)),
           let forecast = try? JSONDecoder().decode(ForecastResponse.self, from: forecastData) {
            windTime = forecast.hourly.time
            windSpeed = forecast.hourly.wind_speed_10m
        }

        return WaveWindData(
            waveTime: marine.hourly.time,
            waveHeight: marine.hourly.wave_height,
            windTime: windTime,
            windSpeed: windSpeed
        )
    }
}

// MARK: - Value series: shared current-value/trend/interpolation logic

final class ValueSeries {
    private let points: [(Date, Double)]
    // Below this, an hour-over-hour change reads as noise rather than a genuine trend.
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

    func dailyExtremes(on date: Date) -> (high: Double, low: Double)? {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TideClock.londonTZ
        guard let dayStart = calendar.date(from: calendar.dateComponents([.year, .month, .day], from: date)) else {
            return nil
        }
        let dayEnd = dayStart.addingTimeInterval(86_400 - 1)
        let dayValues = points.filter { $0.0 >= dayStart && $0.0 <= dayEnd }.map { $0.1 }
        guard let low = dayValues.min(), let high = dayValues.max() else { return nil }
        return (high, low)
    }

    func hourlySamples(hours: [Int], on date: Date) -> [Double?] {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TideClock.londonTZ
        let dayComponents = calendar.dateComponents([.year, .month, .day], from: date)
        return hours.map { hour -> Double? in
            var comps = dayComponents
            comps.hour = hour
            comps.minute = 0
            comps.second = 0
            guard let hourDate = calendar.date(from: comps) else { return nil }
            return value(at: hourDate)
        }
    }

    var isEmpty: Bool { points.isEmpty }
}

// MARK: - Multi-series hourly chart rendering

struct ChartSeries {
    let label: String
    let unit: String
    let samples: [Double?]
}

enum HourlyChart {
    static let levels: [Character] = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

    private static func padCenter(_ text: String, width: Int) -> String {
        let len = text.count
        guard len < width else { return text }
        let totalPad = width - len
        let left = totalPad / 2
        let right = totalPad - left
        return String(repeating: " ", count: left) + text + String(repeating: " ", count: right)
    }

    private static func barRow(for samples: [Double?], cellWidth: Int) -> (row: String, min: Double, max: Double)? {
        let valid = samples.compactMap { $0 }
        guard let minV = valid.min(), let maxV = valid.max() else { return nil }
        let spread = maxV - minV
        var row = ""
        for sample in samples {
            if let sample = sample {
                let fraction = spread > 0 ? (sample - minV) / spread : 0.5
                let levelIndex = min(levels.count - 1, max(0, Int((fraction * Double(levels.count - 1)).rounded())))
                row += padCenter(String(levels[levelIndex]), width: cellWidth)
            } else {
                row += padCenter("·", width: cellWidth)
            }
        }
        return (row, minV, maxV)
    }

    // One bar row per series (tide first, then any others present), a shared
    // hour axis, and a legend line stating each series' actual range — since
    // each series is independently scaled to fill the same vertical space,
    // the ranges are what make the bars comparable rather than misleading.
    static func lines(hours: [Int], series: [ChartSeries], fontSize: Int, cellWidth: Int = 4) -> [String] {
        var result: [String] = []
        var legendParts: [String] = []

        for s in series {
            guard let bar = barRow(for: s.samples, cellWidth: cellWidth) else { continue }
            result.append(bar.row + " | font=Menlo size=\(fontSize)")
            legendParts.append(String(format: "%@ %.1f–%.1f%@", s.label, bar.min, bar.max, s.unit))
        }

        let hourRow = hours.map { padCenter(String(format: "%02d", $0), width: cellWidth) }.joined()
        result.append(hourRow + " | font=Menlo size=\(fontSize) color=gray")
        result.append(legendParts.joined(separator: "  ·  ") + " | size=11 color=gray")
        return result
    }
}

// MARK: - Forecast: yesterday + N-day view combining tide/wave/wind

struct ForecastDay {
    let label: String
    let tideExtremes: [TideResponse.Extreme]
    let waveExtremes: (high: Double, low: Double)?
    let windExtremes: (high: Double, low: Double)?

    func lines() -> [String] {
        var result: [String] = []
        for extreme in tideExtremes {
            let kind = extreme.type == "high" ? "High" : "Low"
            let time = TideClock.parseISODate(extreme.localTime).map { TideClock.format($0, as: "HH:mm") } ?? ""
            result.append(String(format: "--%@ %.1fm at %@", kind, extreme.height, time))
        }
        if let wave = waveExtremes {
            result.append(String(format: "--Wave: %.1f–%.1fm", wave.low, wave.high))
        }
        if let wind = windExtremes {
            result.append(String(format: "--Wind: %.1f–%.1f m/s", wind.low, wind.high))
        }
        return result
    }
}

final class TideForecast {
    private let extremes: [TideResponse.Extreme]
    private let waveSeries: ValueSeries?
    private let windSeries: ValueSeries?

    init(extremes: [TideResponse.Extreme], waveSeries: ValueSeries?, windSeries: ValueSeries?) {
        self.extremes = extremes
        self.waveSeries = waveSeries
        self.windSeries = windSeries
    }

    private func extremesByDate() -> (order: [String], byDate: [String: [TideResponse.Extreme]]) {
        var seenDates: [String] = []
        var byDate: [String: [TideResponse.Extreme]] = [:]
        for extreme in extremes {
            if !seenDates.contains(extreme.localDate) {
                seenDates.append(extreme.localDate)
            }
            byDate[extreme.localDate, default: []].append(extreme)
        }
        return (seenDates, byDate)
    }

    func yesterday(from today: Date) -> ForecastDay? {
        let yesterdayString = TideClock.format(today.addingTimeInterval(-86_400), as: "yyyy-MM-dd")
        let (_, byDate) = extremesByDate()
        guard let tideExtremes = byDate[yesterdayString] else { return nil }
        return day(dateString: yesterdayString, label: "Yesterday", tideExtremes: tideExtremes)
    }

    func days(from today: Date, limit: Int) -> [ForecastDay] {
        let todayString = TideClock.format(today, as: "yyyy-MM-dd")
        let tomorrowString = TideClock.format(today.addingTimeInterval(86_400), as: "yyyy-MM-dd")
        let (order, byDate) = extremesByDate()

        return order.filter { $0 >= todayString }.prefix(limit).map { dateString in
            day(
                dateString: dateString,
                label: label(for: dateString, todayString: todayString, tomorrowString: tomorrowString),
                tideExtremes: byDate[dateString] ?? []
            )
        }
    }

    private func day(dateString: String, label: String, tideExtremes: [TideResponse.Extreme]) -> ForecastDay {
        let inFormatter = DateFormatter()
        inFormatter.dateFormat = "yyyy-MM-dd"
        inFormatter.timeZone = TideClock.londonTZ
        let dayDate = inFormatter.date(from: dateString) ?? Date()
        // Noon avoids landing on a DST boundary when re-deriving the day's range.
        let noon = dayDate.addingTimeInterval(12 * 3600)

        return ForecastDay(
            label: label,
            tideExtremes: tideExtremes,
            waveExtremes: waveSeries?.dailyExtremes(on: noon),
            windExtremes: windSeries?.dailyExtremes(on: noon)
        )
    }

    private func label(for dateString: String, todayString: String, tomorrowString: String) -> String {
        if dateString == todayString { return "Today" }
        if dateString == tomorrowString { return "Tomorrow" }
        let inFormatter = DateFormatter()
        inFormatter.dateFormat = "yyyy-MM-dd"
        inFormatter.timeZone = TideClock.londonTZ
        guard let date = inFormatter.date(from: dateString) else { return dateString }
        return TideClock.format(date, as: "EEE d MMM")
    }
}

// MARK: - Plugin: orchestrates the pieces and prints xbar output

final class TideWidgetPlugin {
    let stationId = "hastings_pier-hgp-gbr-cco"
    let keychain = Keychain(service: "wave-hastings-tidecheck-api-key")
    let wakingHours = Array(stride(from: 6, through: 22, by: 2))

    func run() {
        guard let apiKey = keychain.readPassword() else {
            print("—")
            print("---")
            print("No TideCheck API key found in Keychain | color=red")
            return
        }

        let tideClient = TideAPIClient(stationId: stationId, apiKey: apiKey)
        guard let tideData = tideClient.loadTideData() else {
            print("—")
            print("---")
            print("Couldn't fetch tide data | color=red")
            print("Refresh | refresh=true")
            return
        }

        let waveClient = WaveAPIClient()
        let waveWindData = waveClient.loadWaveWindData()
        let tideSeries = ValueSeries(
            times: tideData.timeSeries.map { $0.time },
            values: tideData.timeSeries.map { $0.height },
            steadyThreshold: 0.02
        )
        let waveSeries = waveWindData.map {
            ValueSeries(times: $0.waveTime, values: $0.waveHeight, steadyThreshold: 0.05)
        }
        let windSeries = waveWindData.flatMap { data -> ValueSeries? in
            guard let windTime = data.windTime, let windSpeed = data.windSpeed else { return nil }
            return ValueSeries(times: windTime, values: windSpeed, steadyThreshold: 0.3)
        }

        let now = Date()
        let forecast = TideForecast(extremes: tideData.extremes, waveSeries: waveSeries, windSeries: windSeries)

        printMenuBarTitle(tideSeries: tideSeries, now: now)
        printNow(tideSeries: tideSeries, waveSeries: waveSeries, windSeries: windSeries, now: now)
        printChart(tideSeries: tideSeries, waveSeries: waveSeries, windSeries: windSeries, now: now)
        printForecast(forecast: forecast, now: now)
        printFooter(tideClient: tideClient, waveClient: waveClient)
    }

    private func printMenuBarTitle(tideSeries: ValueSeries, now: Date) {
        if let height = tideSeries.value(at: now) {
            print(String(format: "%.1fm %@", height, tideSeries.trend(at: now).arrow))
        } else {
            print("—")
        }
    }

    private func printNow(tideSeries: ValueSeries, waveSeries: ValueSeries?, windSeries: ValueSeries?, now: Date) {
        print("---")
        print("Hastings Pier, UK | size=13")

        var parts: [String] = []
        if let height = tideSeries.value(at: now) {
            parts.append(String(format: "Tide %.1fm %@", height, tideSeries.trend(at: now).arrow))
        }
        if let waveSeries = waveSeries, let height = waveSeries.value(at: now) {
            parts.append(String(format: "Wave %.1fm %@", height, waveSeries.trend(at: now).arrow))
        }
        if let windSeries = windSeries, let speed = windSeries.value(at: now) {
            parts.append(String(format: "Wind %.1f m/s %@", speed, windSeries.trend(at: now).arrow))
        }
        if !parts.isEmpty {
            print(parts.joined(separator: "   "))
        }
    }

    private func printChart(tideSeries: ValueSeries, waveSeries: ValueSeries?, windSeries: ValueSeries?, now: Date) {
        var series: [ChartSeries] = [
            ChartSeries(label: "Tide", unit: "m", samples: tideSeries.hourlySamples(hours: wakingHours, on: now))
        ]
        if let waveSeries = waveSeries {
            series.append(ChartSeries(label: "Wave", unit: "m", samples: waveSeries.hourlySamples(hours: wakingHours, on: now)))
        }
        if let windSeries = windSeries {
            series.append(ChartSeries(label: "Wind", unit: "m/s", samples: windSeries.hourlySamples(hours: wakingHours, on: now)))
        }

        guard !tideSeries.isEmpty else { return }
        print("Today, 6am–10pm | size=12")
        HourlyChart.lines(hours: wakingHours, series: series, fontSize: 10).forEach { print($0) }
    }

    private func printForecast(forecast: TideForecast, now: Date) {
        print("---")
        print("Forecast | size=13")

        if let yesterday = forecast.yesterday(from: now) {
            print("\(yesterday.label): | size=12 color=gray")
            yesterday.lines().forEach { print($0 + " | color=gray") }
        }

        for day in forecast.days(from: now, limit: 5) {
            print("\(day.label): | size=12")
            day.lines().forEach { print($0) }
        }
    }

    private func printFooter(tideClient: TideAPIClient, waveClient: WaveAPIClient) {
        print("---")
        if let modDate = tideClient.cacheModificationDate {
            print("Data fetched at \(TideClock.format(modDate, as: "HH:mm")) (cached ~6h) | size=11 color=gray")
        }
        print("Force refresh (uses API calls) | bash=/bin/rm param1=-f param2=\(tideClient.cacheURL.path) param3=\(waveClient.cacheURL.path) terminal=false refresh=true")
        print("Refresh display | refresh=true")
    }
}

TideWidgetPlugin().run()
