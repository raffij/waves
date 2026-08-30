import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_LOCATION, LOCATIONS, type Location } from '../models/Location';

const STORAGE_KEY = 'wave-hastings-location';

export interface LocationState {
  /** undefined until the persisted location has been read from storage */
  location: Location | undefined;
  toggleLocation: () => void;
}

// Persists the selected location, mirroring useTheme's toggle pattern.
// `location` starts undefined (rather than defaulting straight to
// DEFAULT_LOCATION) so callers can wait for the real persisted value
// instead of firing off a request for the wrong location while it loads.
export function useLocation(): LocationState {
  const [location, setLocation] = useState<Location | undefined>(undefined);
  // If the user taps toggle before the AsyncStorage read resolves, that read
  // must not clobber their choice once it does land.
  const toggledBeforeHydration = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((savedId) => {
      if (toggledBeforeHydration.current) return;
      const saved = LOCATIONS.find((candidate) => candidate.id === savedId);
      setLocation(saved ?? DEFAULT_LOCATION);
    });
  }, []);

  const toggleLocation = useCallback(() => {
    toggledBeforeHydration.current = true;
    setLocation((prev) => {
      const currentIndex = LOCATIONS.findIndex((candidate) => candidate.id === (prev ?? DEFAULT_LOCATION).id);
      const next = LOCATIONS[(currentIndex + 1) % LOCATIONS.length];
      AsyncStorage.setItem(STORAGE_KEY, next.id);
      return next;
    });
  }, []);

  return { location, toggleLocation };
}
