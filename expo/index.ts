import { registerRootComponent } from 'expo';

import App from './App';
import PreviewApp from './App.preview';

// `npm run preview` sets EXPO_PUBLIC_PREVIEW=1 to boot the synthetic-data
// harness instead of the real app — for eyeballing UI changes without a
// TideCheck key or network access to TideCheck/Open-Meteo. See
// App.preview.tsx.
const RootComponent = process.env.EXPO_PUBLIC_PREVIEW === '1' ? PreviewApp : App;

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(RootComponent);
