import { focusManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

// TanStack Query's `refetchOnWindowFocus` already works on web (it listens
// to the browser's own `visibilitychange`/`focus` events), but on native it
// has nothing to listen to unless we wire it to AppState ourselves — this
// is that wiring. It's purely event-driven (AppState fires once per
// foreground/background transition), so it costs nothing while
// backgrounded and only triggers a refetch of stale queries — never a
// background poll — when the app comes back to the foreground.
export function useAppStateFocusManager(): void {
  useEffect(() => {
    if (Platform.OS === 'web') return;

    const onChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };
    const subscription = AppState.addEventListener('change', onChange);
    return () => subscription.remove();
  }, []);
}
