import Foundation

// Mirrors the API response shapes in mac-widget/wave-hastings.15m.swift —
// duplicated rather than shared, per this repo's convention of every client
// owning its own hand-written copy of the same shape (see docs/architecture.md).

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
