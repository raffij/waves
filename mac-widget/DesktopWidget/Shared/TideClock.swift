import Foundation

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
        // offset/Z, so fall back to a local parser (see the xbar script's
        // identical comment for why).
        return localDateTimeFormatter.date(from: string)
    }

    static func format(_ date: Date, as pattern: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = pattern
        formatter.timeZone = londonTZ
        return formatter.string(from: date)
    }
}
