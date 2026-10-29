import { createAuthController } from '../auth/controller.js';
const $ = (id) => document.getElementById(id);
const status = (message) => { $('status').textContent = message; };
const show = (id) => {
  for (const name of ['login-form','recovery-form','workspace']) $(name).hidden = name !== id;
};
const busy = (value) => {
  for (const button of document.querySelectorAll('button')) button.disabled = value;
};
const config = globalThis.VAPORIZE_NEXT_CONFIG;
if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
  show(null);
  status('Ambiente ainda não configurado. Acesso bloqueado até a configuração isolada de homologação.');
} else {
  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { detectSessionInUrl: false, persistSession: false, autoRefreshToken: true }
    });
    const controller = createAuthController(supabase);
    controller.subscribe(({ recovering, internalAccess }) => {
      if (recovering) show('recovery-form');
      else if (!internalAccess && !$('workspace').hidden) {
        show('login-form');
        status('Acesso empresarial revogado. Entre novamente após a regularização.');
      }
    });
    const url = new URL(location.href);
    const hasRecoveryCallback = url.searchParams.has('token_hash') ||
      url.searchParams.has('code') ||
      new URLSearchParams(url.hash.slice(1)).has('access_token');
    if (hasRecoveryCallback) {
      show(null);
      status('Validando link de recuperação...');
      try {
        const result = await controller.beginRecovery(location.href);
        if (!result) throw new Error('Link não reconhecido');
        history.replaceState(null, '', result.sanitizedUrl);
        show('recovery-form');
        status('Defina sua nova senha. Os módulos internos permanecem bloqueados.');
      } catch {
        history.replaceState(null, '', location.pathname);
        show('login-form');
        status('Link inválido ou expirado. Solicite uma nova recuperação.');
      }
    } else if (await controller.requireInternalAccess()) {
      show('workspace');
      status('Sessão autenticada.');
    } else {
      show('login-form');
      status('Entre com seu e-mail e senha.');
    }
    $('login-form').addEventListener('submit', async (event) => {
      event.preventDefault(); busy(true);
      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: $('email').value.trim(), password: $('password').value
        });
        if (error) throw error;
        if (!await controller.requireInternalAccess()) {
          controller.clearAccess();
          try { await supabase.auth.signOut({ scope: 'local' }); }
          catch { /* acesso permanece bloqueado mesmo se o logout falhar */ }
          throw new Error('Vínculo com empresa ainda não validado');
        }
        $('password').value = '';
        show('workspace');
        status('Sessão autenticada.');
      } catch (error) { status(error?.message === 'Vínculo com empresa ainda não validado' ? 'Identidade confirmada, mas acesso aos módulos bloqueado até a validação da empresa.' : 'Não foi possível entrar. Verifique suas credenciais.'); }
      finally { busy(false); }
    });
    $('forgot').addEventListener('click', async () => {
      if (!$('email').reportValidity()) return;
      busy(true);
      try {
        const redirect = new URL(location.pathname, location.origin);
        redirect.searchParams.set('flow', 'recovery');
        const redirectTo = redirect.toString();
        const { error } = await supabase.auth.resetPasswordForEmail($('email').value.trim(), { redirectTo });
        if (error) throw error;
        status('Se o e-mail estiver cadastrado, enviaremos instruções de recuperação.');
      } catch { status('Não foi possível solicitar a recuperação agora.'); }
      finally { busy(false); }
    });
    $('recovery-form').addEventListener('submit', async (event) => {
      event.preventDefault(); busy(true);
      try {
        await controller.changePassword($('new-password').value);
        $('new-password').value = '';
        show('login-form');
        status('Senha atualizada. Entre novamente.');
      } catch { status('Não foi possível alterar a senha. Verifique a sessão e tente novamente.'); }
      finally { busy(false); }
    });
    $('logout').addEventListener('click', async () => {
      busy(true);
      try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        controller.clearAccess();
        show('login-form'); status('Sessão encerrada.');
      } catch { status('Falha ao encerrar a sessão.'); }
      finally { busy(false); }
    });
  } catch {
    show(null);
    status('Falha ao inicializar autenticação. Acesso bloqueado.');
  }
}
