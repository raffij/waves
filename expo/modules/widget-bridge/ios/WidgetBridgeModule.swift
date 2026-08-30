import ExpoModulesCore
import WidgetKit

// The iOS widget (targets/widget/Widget.swift) runs in its own process and
// sandbox, so it can't read the app's AsyncStorage/SecureStore directly.
// This module is the only bridge between them: the app calls syncConfig()
// whenever the API key or selected location changes, writing it to the App
// Group both the app and the widget extension can see, then reloadWidgets()
// tells WidgetKit to re-run the timeline provider against the new config.
public class WidgetBridgeModule: Module {
  static let appGroupId = "group.com.anonymous.hastings-tide"
  static let configKey = "widgetConfig"

  public func definition() -> ModuleDefinition {
    Name("WidgetBridge")

    Function("syncConfig") { (json: String) in
      UserDefaults(suiteName: WidgetBridgeModule.appGroupId)?.set(json, forKey: WidgetBridgeModule.configKey)
    }

    Function("reloadWidgets") {
      WidgetCenter.shared.reloadAllTimelines()
    }
  }
}
