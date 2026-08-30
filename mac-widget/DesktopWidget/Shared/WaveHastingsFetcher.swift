import Foundation

private func fetchJSON<T: Decodable>(_ url: URL, headers: [String: String] = [:], as type: T.Type) async -> T? {
    var request = URLRequest(url: url)
    request.timeoutInterval = 8
    for (key, value) in headers { request.setValue(value, forHTTPHeaderField: key) }
    guard let (data, response) = try? await URLSession.shared.data(for: request),
          let http = response as? HTTPURLResponse, http.statusCode == 200 else { return nil }
    return try? JSONDecoder().decode(T.self, from: data)
}

// Everything one widget timeline entry needs to render.
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

// Fetches tide, wave and wind fresh on every timeline reload — no disk
// cache of its own, unlike the xbar script, since WidgetKit already
// throttles macOS desktop widget reloads to roughly hourly.
enum WaveHastingsFetcher {
    static func loadSnapshot(config: DesktopWidgetConfig) async -> WidgetSnapshot? {
        let location = config.location
        let tideURL = URL(string: "https://tidecheck.com/api/station/\(location.stationId)/tides")!
        guard let tideData = await fetchJSON(tideURL, headers: ["X-API-Key": config.apiKey], as: TideResponse.self) else {
            return nil
        }

        let now = Date()
        let startDate = TideClock.format(now.addingTimeInterval(-86_400), as: "yyyy-MM-dd")
        let endDate = TideClock.format(now.addingTimeInterval(2 * 86_400), as: "yyyy-MM-dd")

        var marineComponents = URLComponents(string: "https://marine-api.open-meteo.com/v1/marine")!
        marineComponents.queryItems = [
            URLQueryItem(name: "latitude", value: location.latitude),
            URLQueryItem(name: "longitude", value: location.longitude),
            URLQueryItem(name: "start_date", value: startDate),
            URLQueryItem(name: "end_date", value: endDate),
            URLQueryItem(name: "hourly", value: "wave_height"),
            URLQueryItem(name: "timezone", value: "Europe/London"),
        ]
        let marine = await fetchJSON(marineComponents.url!, as: MarineResponse.self)

        var forecastComponents = URLComponents(string: "https://api.open-meteo.com/v1/forecast")!
        forecastComponents.queryItems = [
            URLQueryItem(name: "latitude", value: location.latitude),
            URLQueryItem(name: "longitude", value: location.longitude),
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
            locationName: location.displayName,
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
