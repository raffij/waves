import Foundation

// Current-value/trend by linear interpolation between the nearest samples.
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
