import { Platform } from 'react-native';
import WidgetBridge from '../../modules/widget-bridge';
import type { Location } from '../models/Location';

// Hands the API key and selected location to the iOS home-screen widget via
// a shared App Group (see modules/widget-bridge and
// targets/widget/Widget.swift) — the widget then fetches tide/wave/wind
// itself, the same way the macOS menu-bar widget does, rather than the app
// pushing already-fetched data over.
export function syncWidgetConfig(apiKey: string, location: Location): void {
  if (Platform.OS !== 'ios' || !WidgetBridge) return;

  WidgetBridge.syncConfig(
    JSON.stringify({
      apiKey,
      stationId: location.stationId,
      latitude: location.latitude,
      longitude: location.longitude,
      locationName: location.name,
    }),
  );
  WidgetBridge.reloadWidgets();
}
