# Documento de cobrança de pacote — 05/10/2026

## Implementação
Base: 9f92d2e (correção de pré-pagamento sobre homologação isolada).
Branch local: fix/package-visual-document-20261005.
Backend configurado: wwivmyhlwqyzmaexkmnk, confirmado como Vaporeasy Homologacao Isolada. Produção usa outro projeto.

O botão abre o modal de recibos. A apresentação lê package_charges e dados cadastrais existentes. Compartilhar cobrança/recibo gera PNG; Compartilhar PDF utiliza jsPDF e o mesmo exportador dos recibos agrupados. Sem suporte a compartilhar arquivos, baixa o arquivo. Nenhum fallback para texto. Após a confirmação existente, abre o recibo da mesma cobrança. O status é relido antes de exportar. Canceladas/cobertas não são apresentadas como cobranças pendentes.

Não foram alterados banco, preços, cobranças existentes, migrations, RPCs ou produção nesta tarefa. A migration presente na base já existia antes desta alteração.

## Testes executados
13 verificações de componente aprovadas com DOM e API simulados, usando funções extraídas do index.html real. Geração de PNG e PDF reais, com inspeção visual das imagens pendente/paga e renderização da primeira página do PDF. Verificação sintática dos scripts aprovada.
- Modal pendente; abertura sem compartilhar automaticamente.
- PNG/PDF anexados ao contrato de compartilhamento simulado.
- Exportação sem escrita financeira.
- Confirmação pela RPC existente; mesmo identificador e valor; recibo após confirmação simulada.
- Releitura do status antes de exportar.
- Download do arquivo quando compartilhamento não é suportado.
- Bloqueio de canceladas e perfil colaborador.
- Campos longos: dimensões dinâmicas no canvas.

Reprodução: NODE_MODULES do runtime em CODEX_PRIMARY_RUNTIME_NODE_MODULES; executar `node tests/package-document/run.cjs /caminho/jspdf.umd.min.js`, usando jsPDF 2.5.1 já empregado no aplicativo. O HTML tests/package-document.html oferece a execução dos mesmos componentes em navegador, com dados fictícios e sem banco.

## Pendências / bloqueios
NÃO TESTADOS: interface em navegador móvel, Web Share nativo/WhatsApp, E2E autenticado contra banco de homologação, regressão dos recibos agrupados no navegador.
O navegador local não instalou; o navegador remoto não acessa localhost. A revisão automática rejeitou o push ao GitHub por exigir autorização explícita para publicar código naquele destino. Nenhum deploy desta alteração foi realizado. Necessário autorizar push somente da branch de teste e concluir validação de homologação. Produção segue proibida sem nova autorização.
