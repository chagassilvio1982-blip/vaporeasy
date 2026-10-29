/**
 * Keep the Supabase PKCE code verifier across an email redirect while keeping
 * session tokens in memory only. No V2 storage or credentials are used.
 */
export function createEphemeralPkceStorage(tabStorage) {
  const volatileAuth = new Map();
  const isVerifier = (key) => typeof key === 'string' && key.endsWith('-code-verifier');
  return {
    getItem(key) {
      if (isVerifier(key)) return tabStorage.getItem(key);
      return volatileAuth.get(key) ?? null;
    },
    setItem(key, value) {
      if (isVerifier(key)) tabStorage.setItem(key, value);
      else volatileAuth.set(key, value);
    },
    removeItem(key) {
      if (isVerifier(key)) tabStorage.removeItem(key);
      else volatileAuth.delete(key);
    }
  };
}
