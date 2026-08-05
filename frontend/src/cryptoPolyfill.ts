// Provides `globalThis.crypto.getRandomValues`, which the pure-JS E2EE crypto
// (@noble, see e2ee/crypto.ts) needs for key generation and AES-GCM nonces.
//
// React Native's Hermes engine ships no `crypto` global. expo-crypto's
// synchronous `getRandomValues` is a real CSPRNG and works in Expo Go (no
// native custom module required), so we install it as the global before any
// E2EE code runs. Node (tests) already has a compliant implementation, so this
// only fills the gap on-device.
import { getRandomValues } from 'expo-crypto';

const globalRef = globalThis as unknown as {
  crypto?: { getRandomValues?: (array: ArrayBufferView) => ArrayBufferView };
};

if (!globalRef.crypto) {
  globalRef.crypto = {};
}

if (typeof globalRef.crypto.getRandomValues !== 'function') {
  globalRef.crypto.getRandomValues = getRandomValues as unknown as (
    array: ArrayBufferView,
  ) => ArrayBufferView;
}
