/**
 * Vaporize Next — isolated authentication controller.
 * Requires a Supabase JS v2 client supplied by the application.
 * No secrets, credentials or V2 modules are imported here.
 */
export function createAuthController(supabase) {
  if (!supabase?.auth) throw new TypeError('Supabase auth client required');
  let recoverySession = null;
  let recoveryMode = false;
  const listeners = new Set();
  const publish = (state) => { for (const fn of listeners) fn(state); };
  const state = () => ({ recovering: recoveryMode, internalAccess: false });
  const subscribe = (fn) => {
    listeners.add(fn);
    fn(state());
    return () => listeners.delete(fn);
  };
  const clearRecovery = () => {
    recoverySession = null;
    recoveryMode = false;
    publish(state());
  };

  async function beginRecovery(urlString) {
    const url = new URL(urlString);
    const query = url.searchParams;
    const hash = new URLSearchParams(url.hash.replace(/^#/, ''));
    const tokenHash = query.get('token_hash');
    const code = query.get('code');
    const accessToken = hash.get('access_token');
    const refreshToken = hash.get('refresh_token');
    const type = query.get('type') || hash.get('type');
    const recoveryIntent = type === 'recovery' || query.get('flow') === 'recovery';
    const isRecoveryLink = recoveryIntent;
    const hasCode = Boolean(code);
    const hasTokens = Boolean(accessToken && refreshToken);

    // Never treat an ordinary authenticated session as a recovery session.
    if (!isRecoveryLink && !tokenHash && !hasCode && !hasTokens) return false;
    recoveryMode = true;
    recoverySession = null;
    publish(state());
    try {
      let result;
      if (tokenHash) {
        if (type !== 'recovery') throw new Error('Invalid recovery link type');
        result = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
      } else if (code) {
        if (!recoveryIntent) throw new Error('Recovery intent required for PKCE');
        result = await supabase.auth.exchangeCodeForSession(code);
      } else if (hasTokens) {
        if (type !== 'recovery') throw new Error('Invalid recovery token type');
        result = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
      } else {
        throw new Error('Incomplete recovery link');
      }
      if (result.error || !result.data?.session?.user) throw result.error || new Error('Invalid recovery session');
      const { data, error } = await supabase.auth.getUser();
      if (error || !data?.user || data.user.id !== result.data.session.user.id) {
        throw error || new Error('Recovery identity mismatch');
      }
      recoverySession = result.data.session;
      // Remove sensitive callback parameters from address bar; app owns history.
      url.searchParams.delete('token_hash');
      url.searchParams.delete('code');
      url.searchParams.delete('type');
      url.searchParams.delete('flow');
      url.hash = '';
      return { sanitizedUrl: url.toString(), userId: data.user.id };
    } catch (error) {
      try { await supabase.auth.signOut({ scope: 'local' }); } catch { /* best effort */ }
      clearRecovery();
      throw error;
    }
  }

  async function changePassword(newPassword) {
    if (!recoveryMode || !recoverySession?.user) throw new Error('Recovery session required');
    if (typeof newPassword !== 'string' || newPassword.length < 12) throw new Error('Password must have at least 12 characters');
    const { data: current, error: userError } = await supabase.auth.getUser();
    if (userError || !current?.user || current.user.id !== recoverySession.user.id) {
      throw new Error('Recovery session expired');
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
    try {
      const { error: signOutError } = await supabase.auth.signOut({ scope: 'local' });
      if (signOutError) throw signOutError;
    } finally {
      clearRecovery();
    }
    return true;
  }

  async function requireInternalAccess() {
    if (recoveryMode) return false;
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return false;
    // Authentication alone never authorizes access to tenant data.
    // Until membership and organization status are validated server-side,
    // fail closed. Do not enable internal modules from a client-only check.
    return false;
  }

  return { beginRecovery, changePassword, requireInternalAccess, subscribe, state };
}
