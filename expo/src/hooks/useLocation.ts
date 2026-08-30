import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { DEFAULT_LOCATION, LOCATIONS, type Location } from '../models/Location';

const STORAGE_KEY = 'wave-hastings-location';

export interface LocationState {
  location: Location;
  toggleLocation: () => void;
}

// Persists the selected location, mirroring useTheme's toggle pattern.
export function useLocation(): LocationState {
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((savedId) => {
      const saved = LOCATIONS.find((candidate) => candidate.id === savedId);
      if (saved) setLocation(saved);
    });
  }, []);

  const toggleLocation = () => {
    setLocation((prev) => {
      const currentIndex = LOCATIONS.findIndex((candidate) => candidate.id === prev.id);
      const next = LOCATIONS[(currentIndex + 1) % LOCATIONS.length];
      AsyncStorage.setItem(STORAGE_KEY, next.id);
      return next;
    });
  };

  return { location, toggleLocation };
}
