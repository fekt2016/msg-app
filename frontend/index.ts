// Must be first: installs the crypto RNG (globalThis.crypto.getRandomValues)
// that the pure-JS E2EE crypto needs, before any module touching E2EE is
// evaluated. See src/cryptoPolyfill.ts.
import './src/cryptoPolyfill';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
