import { createAuthController } from '../auth/controller.js';
import { attachClientsPanel } from './clients-panel.js';
import { attachVehiclesPanel } from './vehicles-panel.js';
import { attachAppointmentsPanel } from './appointments-panel.js';
import { createEphemeralPkceStorage } from '../auth/storage.js';
const $ = (id) => document.getElementById(id);
const status = (message) => { $('status').textContent = message; };
const show = (id) => {
  for (const name of ['login-form','recovery-form','onboarding-form','workspace']) $(name).hidden = name !== id;
  if (id !== 'workspace') {
    for (const module of ['clients','vehicles','appointments']) {
      $(module + '-list').replaceChildren();
      $(module + '-status').textContent = '';
    }
  }
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
    const authStorage = createEphemeralPkceStorage(sessionStorage);
    const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { flowType: 'pkce', storage: authStorage, detectSessionInUrl: false, persistSession: true, autoRefreshToken: true }
    });
    const controller = createAuthController(supabase);
    attachClientsPanel(supabase, controller, document);
    attachVehiclesPanel(supabase, controller, document);
    attachAppointmentsPanel(supabase, controller, document);
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
    } else if (await controller.canOnboard()) {
      show('onboarding-form');
      status('Identidade confirmada. Cadastre sua primeira empresa.');
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
          if (await controller.canOnboard()) {
            $('password').value = '';
            show('onboarding-form');
            status('Identidade confirmada. Cadastre sua primeira empresa.');
            return;
          }
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
    $('onboarding-form').addEventListener('submit', async (event) => {
      event.preventDefault(); busy(true);
      try {
        const authorized = await controller.createFirstOrganization(
          $('organization-name').value.trim(), $('organization-slug').value.trim()
        );
        if (!authorized) throw new Error('Organization membership not verified');
        show('workspace');
        status('Empresa vinculada. Consultas de clientes, veículos e agendamentos disponíveis.');
      } catch {
        status('Não foi possível criar ou validar a empresa. Verifique os dados e tente novamente.');
      } finally { busy(false); }
    });
    $('onboarding-logout').addEventListener('click', async () => {
      controller.clearAccess();
      show('login-form');
      busy(true);
      try { await supabase.auth.signOut({ scope: 'local' }); }
      catch { /* interface remains blocked */ }
      finally { busy(false); status('Acesso bloqueado.'); }
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
      } catch (error) {
        // Supabase Auth rate limits email delivery; avoid encouraging repeated requests.
        if (error?.status === 429 || error?.code === 'over_email_send_rate_limit') {
          status('Limite temporário de e-mails atingido. Não solicite novamente agora; aguarde a liberação do Supabase.');
        } else {
          status('Não foi possível solicitar a recuperação agora. Verifique a conexão e tente mais tarde.');
        }
      }
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
      controller.clearAccess();
      show('login-form');
      try {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
        status('Sessão encerrada.');
      } catch { status('Acesso bloqueado. Não foi possível confirmar o encerramento local.'); }
      finally { busy(false); }
    });
  } catch {
    show(null);
    status('Falha ao inicializar autenticação. Acesso bloqueado.');
  }
}
