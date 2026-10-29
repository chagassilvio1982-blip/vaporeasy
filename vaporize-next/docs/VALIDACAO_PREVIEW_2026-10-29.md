# Validação externa da Preview — 2026-10-29

## Publicação verificada
Commit de origem da Preview: `a334a80c29ff5ae0a762a70d75d8b15914b2a36a`.
Vercel deployment: `dpl_2QNuikGL6yCX9eH421TMLRpFq5RM`, status READY.
URL: https://vaporeasy-36li5wui1-vaporeasy.vercel.app/vaporize-next/

## Evidência da leitura HTTP pública
- URL `/vaporize-next/`: resposta de página com título `Vaporize Next — Acesso`, idioma pt e texto `Ambiente de homologação`, `Acesso seguro`.
- URL `/`: resposta de página com título `Vaporeasy • Agendamento online`, build antigo 2026.09.28-11 e elementos da aplicação antiga.
- A Preview serve a nova interface em um subdiretório, mas ainda no mesmo projeto Vercel que publica a Vaporeasy antiga. Não equivale a isolamento de hospedagem.
- O extrator de conteúdo incluiu texto de elementos HTML inicialmente ocultos; isso não demonstra que foram exibidos ao usuário no navegador.
- Não foi realizado login, teste real de reset, execução comprovada de CI ou teste de isolamento multiempresa.
- Tentativa de criar projeto Vercel independente retornou 403; bloqueio permanece.

## Próximos passos
1. Confirmar que os scripts JS carregam sem erros no navegador e que a tela inicial exige login.
2. Executar testes automatizados e validar recuperação com contas sintéticas autorizadas.
3. Criar projeto Vercel isolado quando houver permissão; não alterar o projeto V2.
