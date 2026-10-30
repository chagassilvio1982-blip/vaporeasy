/**
 * Isolated Supabase auth storage for Vaporize Next homologation.
 * Session and PKCE verifier persist only within the current browser tab
 * (sessionStorage), surviving reloads without sharing with V2 or other apps.
 * Supabase handles refresh-token rotation; signOut removes the session.
 */
export function createEphemeralPkceStorage(tabStorage) {
  if (!tabStorage || typeof tabStorage.getItem !== 'function' ||
      typeof tabStorage.setItem !== 'function' || typeof tabStorage.removeItem !== 'function') {
    throw new TypeError('Session storage required');
  }
  const prefix = 'vaporize-next:auth:';
  const isVerifier = (key) => typeof key === 'string' && key.endsWith('-code-verifier');
  const storageKey = (key) => prefix + key;
  return {
    getItem(key) {
      return tabStorage.getItem(storageKey(key)) ?? (isVerifier(key) ? tabStorage.getItem(key) : null);
    },
    setItem(key, value) {
      tabStorage.setItem(storageKey(key), value);
      if (isVerifier(key)) tabStorage.removeItem(key);
    },
    removeItem(key) {
      tabStorage.removeItem(storageKey(key));
      if (isVerifier(key)) tabStorage.removeItem(key);
    }
  };
}
