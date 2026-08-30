import { useEffect } from 'react';
import type { Location } from '../models/Location';
import { syncWidgetConfig } from '../services/WidgetSync';

// Keeps the iOS widget's shared config in step with the app's own API key
// and selected location, whenever either becomes available or changes.
export function useWidgetSync(apiKey: string | null | undefined, location: Location | undefined): void {
  useEffect(() => {
    if (!apiKey || !location) return;
    syncWidgetConfig(apiKey, location);
  }, [apiKey, location]);
}
