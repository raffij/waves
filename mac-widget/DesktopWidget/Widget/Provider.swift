import WidgetKit

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
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(60 * 60))))
        }
    }
}
