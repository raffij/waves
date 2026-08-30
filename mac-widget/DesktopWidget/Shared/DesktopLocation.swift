import Foundation

// Mirrors expo/src/models/Location.ts — hand-picked here rather than
// user-editable, since the desktop widget has no equivalent of the app's
// AsyncStorage-backed location list yet.
enum DesktopLocation: String, CaseIterable, Identifiable, Codable {
    case hastings
    case morecambe

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .hastings: return "Hastings Pier"
        case .morecambe: return "Morecambe"
        }
    }

    var stationId: String {
        switch self {
        case .hastings: return "hastings_pier-hgp-gbr-cco"
        case .morecambe: return "fes2022-morecambe"
        }
    }

    var latitude: String {
        switch self {
        case .hastings: return "50.86"
        case .morecambe: return "54.07"
        }
    }

    var longitude: String {
        switch self {
        case .hastings: return "0.60"
        case .morecambe: return "-2.87"
        }
    }
}
