# Relatório incremental — Vaporize Next — 2026-10-29
## Confirmado
- Supabase Next: https://cfpvexgkjsqpwhebsoos.supabase.co (URL pública de API; não é chave).
- Migração 0001 no schema vaporize_next aplicada em homologação; quatro tabelas com RLS.
- Controle de acesso: authenticated tem somente SELECT nas quatro tabelas; políticas de leitura usam is_member.
- Interface de login, recuperação e guarda de sessão versionada sob vaporize-next/.
- Recuperação PKCE exige marcador flow=recovery na URL de retorno; solicitação de recuperação acrescenta esse marcador.
- Persistência de sessão no navegador desativada (persistSession:false); requer autenticação após recarregar.
- Preview Vercel de commit 9a23095: dpl_Ep4sEoNEx5YpMFMMZPQo7D9awcrR, READY, URL vaporeasy-423bc7knj-vaporeasy.vercel.app; target null (Preview).
## Limitações
- A branch Next foi derivada de V3. O projeto Vercel atual pode publicar arquivos legados na raiz; READY não comprova que /vaporize-next/ esteja servindo a nova interface.
- Tentativa de obter árvore da publicação retornou 404 File tree not found. Caminho servido NÃO VERIFICADO.
- Testes unitários ainda sem resultado comprovado. Consulta de runs do commit de workflow retornou lista vazia, sem evidência de aprovação.
- Arquivo config.example.js contém somente placeholder; nenhuma chave real foi publicada, conexão de login NÃO ESTÁ ATIVA.
- Testes de isolamento entre duas empresas continuam pendentes por bloqueio de execução anterior.
## Próximos passos
1. Verificar execução de CI e corrigir testes.
2. Preparar publicação isolada (projeto Vercel próprio ou root directory vaporize-next em projeto separado), sem alterar configurações do projeto V2.
3. Configurar apenas chave publishable do Supabase Next no ambiente de Preview isolado; verificar callback autorizado no Supabase Auth.
4. Validar login/recuperação em navegador, depois RLS A/B.
## Produção
Nenhuma alteração intencional na V2, no Supabase V2 ou nos domínios oficiais. Publicações automáticas ocorreram como Preview no projeto Vercel existente; não há confirmação de entrega da nova interface.
