import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

// Bumps state on an interval so components that read `new Date()` on every
// render — the "now" the day-insights summary narrows from and the
// current-conditions card reads off — actually advance while the app just
// sits open, not only when something else (a fetch, a theme toggle, a
// scrub) happens to trigger a re-render. Without this, "now" freezes at
// whatever moment the last unrelated render happened, so a summary that's
// supposed to describe "from now on" quietly falls behind the real clock.
//
// Paused while backgrounded on native, matching this app's foreground-driven
// refresh policy (see useForecastData's own comment on the same idea) —
// there's nothing to advance for a screen nobody's looking at. A background
// browser tab already throttles its own timers, so web needs no equivalent
// gating.
export function useClockTick(intervalMs: number): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    let id: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (id === null) id = setInterval(() => setTick((t) => t + 1), intervalMs);
    };
    const stop = () => {
      if (id !== null) {
        clearInterval(id);
        id = null;
      }
    };

    start();
    const onChange = (status: AppStateStatus) => (status === 'active' ? start() : stop());
    const subscription = AppState.addEventListener('change', onChange);
    return () => {
      stop();
      subscription.remove();
    };
  }, [intervalMs]);
}
