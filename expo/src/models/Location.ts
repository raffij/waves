export interface Location {
  id: string;
  name: string;
  region: string;
  stationId: string;
  latitude: string;
  longitude: string;
}

export const LOCATIONS: Location[] = [
  {
    id: 'hastings',
    name: 'Hastings Pier',
    region: 'East Sussex',
    stationId: 'hastings_pier-hgp-gbr-cco',
    latitude: '50.86',
    longitude: '0.60',
  },
  {
    id: 'morecambe',
    name: 'Morecambe',
    region: 'Lancashire',
    stationId: 'fes2022-morecambe',
    latitude: '54.07',
    longitude: '-2.87',
  },
];

export const DEFAULT_LOCATION = LOCATIONS[0];
