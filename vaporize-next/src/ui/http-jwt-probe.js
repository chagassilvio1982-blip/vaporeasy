// Diagnóstico HTTP/JWT somente leitura. Nunca registra JWT, chave ou resposta de usuário.
export function attachHttpJwtProbe(supabase, controller, document, config) {
  const button = document.getElementById('verify-http-jwt');
  const output = document.getElementById('http-jwt-status');
  const expectedHost = 'cfpvexgkjsqpwhebsoos.supabase.co';
  button.addEventListener('click', async () => {
    const state = controller.state();
    if (!state.internalAccess || state.recovering ||
        document.getElementById('workspace').hidden) return;
    button.disabled = true;
    output.textContent = 'Verificando HTTP/JWT em homologação...';
    try {
      const base = new URL(config.supabaseUrl);
      if (base.protocol !== 'https:' || base.hostname !== expectedHost ||
          base.pathname !== '/' || base.search || base.hash) throw new Error('project');
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const jwt = sessionData?.session?.access_token;
      if (sessionError || !jwt) throw new Error('session');
      const headers = {
        apikey: config.supabaseAnonKey,
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/json'
      };
      const opts = { method: 'GET', cache: 'no-store', redirect: 'error',
        signal: AbortSignal.timeout(12000) };
      const auth = await fetch(new URL('/auth/v1/user', base), { ...opts, headers });
      const authOk = auth.status === 200;
      const rest = authOk ? await fetch(
        new URL('/rest/v1/appointments?select=id&limit=0', base),
        { ...opts, headers: { ...headers, 'Accept-Profile': 'vaporize_next' } }
      ) : null;
      // Nunca incluir corpo da resposta, identificadores ou tokens no relatório.
      if (!controller.state().internalAccess || controller.state().recovering ||
          document.getElementById('workspace').hidden) return;
      output.textContent = `Auth HTTP ${auth.status}: ${authOk ? 'OK' : 'FALHOU'} | Agendamentos REST HTTP ${rest?.status ?? 'não executado'}: ${rest?.status === 200 ? 'OK' : 'FALHOU'} | Teste somente leitura.`;
    } catch {
      if (controller.state().internalAccess && !controller.state().recovering)
        output.textContent = 'Teste HTTP/JWT não concluído: sessão, configuração ou rede indisponível.';
    } finally { button.disabled = false; }
  });
  controller.subscribe(({ recovering, internalAccess }) => {
    if (recovering || !internalAccess) output.textContent = '';
  });
}
