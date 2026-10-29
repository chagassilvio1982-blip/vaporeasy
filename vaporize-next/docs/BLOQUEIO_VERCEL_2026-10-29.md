# Vaporize Next — Bloqueio de projeto isolado na Vercel
Data: 2026-10-29

## Ação executada
Solicitada criação do projeto `vaporize-next-homologacao` no time `team_zbfz6sgTQoxULaegFwhnosFh`, com `rootDirectory=vaporize-next`, sem ligação automática com domínio de produção.

## Resultado comprovado
Vercel respondeu HTTP 403 forbidden: `You don't have permission to create the project.`
Nenhum novo projeto foi confirmado como criado. Nenhuma configuração do projeto `vaporeasy` foi alterada.

## Evidências complementares
A branch `vaporize-next/isolado-20261029` possui publicações automáticas READY no projeto Vercel `vaporeasy`, porém a pasta efetivamente servida não foi verificada. A API de árvore de arquivos retornou 404 File tree not found.
Consulta GitHub Actions por commit do workflow não encontrou runs; execução dos testes permanece não confirmada.

## Desbloqueio necessário
Conceder à integração Vercel permissão de criar projetos no time indicado ou criar manualmente um projeto vazio isolado com o nome `vaporize-next-homologacao`. Não alterar rootDirectory, build ou domínios do projeto `vaporeasy`.
Configurar o novo projeto com root directory `vaporize-next`, branch Next e somente Preview, antes de publicar. Verificar URL e tela servida. Configurar autenticação apenas com chave publishable do Supabase Next e callback permitido.
