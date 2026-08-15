#!/usr/bin/swift

// <xbar.title>Hastings Tide Level</xbar.title>
// <xbar.version>3.0</xbar.version>
// <xbar.author>Raffi</xbar.author>
// <xbar.desc>Shows current tide level in Hastings, UK, with 5-day high/low forecast, via TideCheck API.</xbar.desc>
// <xbar.dependencies>swift</xbar.dependencies>

import Foundation

// MARK: - Data model

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

// MARK: - Shared date handling

enum TideClock {
    static let londonTZ = TimeZone(identifier: "Europe/London")!

    static func parseISODate(_ string: String) -> Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: string)
    }

    static func format(_ date: Date, as pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = pattern
        formatter.timeZone = londonTZ
        return formatter.string(from: date)
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

// MARK: - API client with disk cache

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
}

// MARK: - Tide series: current level + hourly chart sampling

final class TideSeries {
    private let points: [(Date, Double)]

    init(_ series: [TideResponse.SeriesPoint]) {
        points = series.compactMap { point in
            guard let date = TideClock.parseISODate(point.time) else { return nil }
            return (date, point.height)
        }.sorted { $0.0 < $1.0 }
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

    func height(at date: Date) -> Double? {
        let (before, after) = neighbors(of: date)
        if let before = before, let after = after {
            let total = after.0.timeIntervalSince(before.0)
            let elapsed = date.timeIntervalSince(before.0)
            let fraction = total > 0 ? elapsed / total : 0
            return before.1 + (after.1 - before.1) * fraction
        }
        return before?.1 ?? after?.1
    }

    func currentLevel(at date: Date) -> (height: Double, trend: String)? {
        guard !points.isEmpty, let height = height(at: date) else { return nil }
        let (before, after) = neighbors(of: date)
        if let before = before, let after = after {
            let trend = after.1 > before.1 ? "rising" : (after.1 < before.1 ? "falling" : "steady")
            return (height, trend)
        }
        return (height, "—")
    }

    func hourlyChart(hours: [Int], on date: Date, cellWidth: Int = 4) -> HourlyChart? {
        guard !points.isEmpty else { return nil }

        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TideClock.londonTZ
        let dayComponents = calendar.dateComponents([.year, .month, .day], from: date)

        let hourDates: [Date] = hours.compactMap { hour in
            var comps = dayComponents
            comps.hour = hour
            comps.minute = 0
            comps.second = 0
            return calendar.date(from: comps)
        }

        let samples: [Double?] = hourDates.map { height(at: $0) }
        let validSamples = samples.compactMap { $0 }
        guard let minHeight = validSamples.min(), let maxHeight = validSamples.max() else { return nil }

        return HourlyChart(hours: hours, samples: samples, minHeight: minHeight, maxHeight: maxHeight, cellWidth: cellWidth)
    }
}

// MARK: - Hourly chart rendering

struct HourlyChart {
    static let levels: [Character] = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"]

    let hours: [Int]
    let samples: [Double?]
    let minHeight: Double
    let maxHeight: Double
    let cellWidth: Int

    private static func padCenter(_ text: String, width: Int) -> String {
        let len = text.count
        guard len < width else { return text }
        let totalPad = width - len
        let left = totalPad / 2
        let right = totalPad - left
        return String(repeating: " ", count: left) + text + String(repeating: " ", count: right)
    }

    private var rows: (hourRow: String, barRow: String, valueRow: String) {
        let spread = maxHeight - minHeight
        var hourRow = "", barRow = "", valueRow = ""
        for (i, hour) in hours.enumerated() {
            hourRow += Self.padCenter(String(format: "%02d", hour), width: cellWidth)
            if let sample = samples[i] {
                let fraction = spread > 0 ? (sample - minHeight) / spread : 0.5
                let levelIndex = min(Self.levels.count - 1, max(0, Int((fraction * Double(Self.levels.count - 1)).rounded())))
                barRow += Self.padCenter(String(Self.levels[levelIndex]), width: cellWidth)
                valueRow += Self.padCenter(String(format: "%.1f", sample), width: cellWidth)
            } else {
                barRow += Self.padCenter("·", width: cellWidth)
                valueRow += Self.padCenter("–", width: cellWidth)
            }
        }
        return (hourRow, barRow, valueRow)
    }

    func lines(fontSize: Int) -> [String] {
        let r = rows
        return [
            r.barRow + " | font=Menlo size=\(fontSize)",
            r.hourRow + " | font=Menlo size=\(fontSize) color=gray",
            r.valueRow + " | font=Menlo size=\(fontSize) color=gray",
        ]
    }
}

// MARK: - 5-day forecast

struct ForecastDay {
    let label: String
    let extremes: [TideResponse.Extreme]

    func lines() -> [String] {
        var result = ["\(label): | size=12"]
        for extreme in extremes {
            let kind = extreme.type == "high" ? "High" : "Low"
            let time = TideClock.parseISODate(extreme.localTime).map { TideClock.format($0, as: "HH:mm") } ?? ""
            result.append(String(format: "--%@ %.1fm at %@", kind, extreme.height, time))
        }
        return result
    }
}

final class TideForecast {
    private let extremes: [TideResponse.Extreme]

    init(_ extremes: [TideResponse.Extreme]) {
        self.extremes = extremes
    }

    func days(from today: Date, limit: Int) -> [ForecastDay] {
        let todayString = TideClock.format(today, as: "yyyy-MM-dd")
        let tomorrowString = TideClock.format(today.addingTimeInterval(86400), as: "yyyy-MM-dd")

        var seenDates: [String] = []
        var byDate: [String: [TideResponse.Extreme]] = [:]
        for extreme in extremes {
            if extreme.localDate < todayString { continue }
            if !seenDates.contains(extreme.localDate) {
                seenDates.append(extreme.localDate)
            }
            byDate[extreme.localDate, default: []].append(extreme)
        }

        return seenDates.prefix(limit).map { dateString in
            ForecastDay(label: label(for: dateString, todayString: todayString, tomorrowString: tomorrowString),
                        extremes: byDate[dateString] ?? [])
        }
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

        let client = TideAPIClient(stationId: stationId, apiKey: apiKey)

        guard let data = client.loadTideData() else {
            print("—")
            print("---")
            print("Couldn't fetch tide data | color=red")
            print("Refresh | refresh=true")
            return
        }

        let now = Date()
        let series = TideSeries(data.timeSeries)
        let forecast = TideForecast(data.extremes)

        printMenuBarTitle(series: series, now: now)
        printDetails(series: series, forecast: forecast, now: now)
        printFooter(client: client)
    }

    private func printMenuBarTitle(series: TideSeries, now: Date) {
        if let current = series.currentLevel(at: now) {
            print(String(format: "%.1fm", current.height))
        } else {
            print("—")
        }
    }

    private func printDetails(series: TideSeries, forecast: TideForecast, now: Date) {
        print("---")
        print("Hastings Pier, UK | size=13")

        if let current = series.currentLevel(at: now) {
            print(String(format: "Now: %.1fm (%@)", current.height, current.trend))
        }

        if let chart = series.hourlyChart(hours: wakingHours, on: now) {
            print("Today, 6am–10pm | size=12")
            chart.lines(fontSize: 10).forEach { print($0) }
        }

        print("---")
        print("5-Day Tide Forecast | size=13")
        for day in forecast.days(from: now, limit: 5) {
            day.lines().forEach { print($0) }
        }
    }

    private func printFooter(client: TideAPIClient) {
        print("---")
        if let modDate = client.cacheModificationDate {
            print("Data fetched at \(TideClock.format(modDate, as: "HH:mm")) (cached ~6h) | size=11 color=gray")
        }
        print("Force refresh (uses an API call) | bash=/bin/rm param1=-f param2=\(client.cacheURL.path) terminal=false refresh=true")
        print("Refresh display | refresh=true")
    }
}

TideWidgetPlugin().run()
