import { requireNativeModule } from 'expo-modules-core';

interface WidgetBridgeModule {
  syncConfig(json: string): void;
  reloadWidgets(): void;
}

// Only exists on iOS (see expo-module.config.json) — requireNativeModule
// throws in Expo Go and on other platforms, so this stays null there and
// every caller treats it as optional.
let nativeModule: WidgetBridgeModule | null = null;
try {
  nativeModule = requireNativeModule<WidgetBridgeModule>('WidgetBridge');
} catch {
  nativeModule = null;
}

export default nativeModule;
