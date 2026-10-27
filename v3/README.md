# Vaporeasy V3 — homologação modular
**Início:** 27/10/2026. **Status:** primeira estrutura criada; não liberada para uso real.

## Estratégia de entrega
Trabalhar em **lotes pequenos e integrados**, cada um com teste e registro antes de continuar. Não acumular implementações isoladas para juntar no fim.

## Escopo da primeira alteração
- Base de código: branch `v3/homologacao-modular-20261027`, derivada de `fix/v2-conclusao-sem-foto-20261017` no commit `60bd3a574c4d8b1da088583bbe85cc7f38e2b16c`.
- V2: `/index.html` permanece exatamente como estava.
- V3: `/v3/index.html`, acessível separadamente quando houver preview da branch.
- CSS incorporado do HTML separado em três arquivos de legado, preservando a ordem original.
- Script principal incorporado no HTML separado em dez arquivos clássicos, na ordem original. **A divisão inicial não reescreve lógica**, justamente para reduzir regressões.
- Identidade visual premium inicial configurada em `v3/styles/premium.css`, com tokens de marca parametrizáveis para futura marca branca.
- PWA com nome, ID e escopo de homologação próprios; não substitui o aplicativo instalado.
- Conclusão sem foto vem da branch de referência, incluindo controle de duplicidade no frontend. A migração SQL correspondente está versionada, **não aplicada aqui**.
- Sem acesso ou escrita em banco de dados, sem publicação em produção.

## Funções que não podem ser perdidas
- Perfis: proprietário, gerente e colaborador, mantendo autorização.
- Clientes, veículos, RG e histórico.
- Agenda, recorrência, atribuição de equipe e agendamento público.
- Conclusão direta, registro de serviço realizado, cancelamento e reprogramação.
- Planos, controle de atendimentos, preços, extras e descontos.
- Financeiro, despesas, recebimentos, Pix, comprovantes e agrupamentos.
- Relatórios, PDFs e configurações operacionais.

## Etapas e critérios de pronto
1. **Lote 1 — separar e preservar.** Verificar que os módulos recompõem byte a byte o script da V2 e a ordem das folhas de estilo; validar sintaxe no Node; abrir preview isolado.
2. **Lote 2 — consolidar funções e cortar código morto.** Fazer por área, mantendo contratos e testes de regressão. Não reduzir linhas sacrificando clareza.
3. **Lote 3 — redesenho premium.** Revisar uso mobile real e visual: agenda, conclusão, cadastros, financeiro e perfil colaborador. Futuro suporte à personalização de marca.
4. **Lote 4 — fluxo real em homologação.** Validar papéis, recorrência, pagamentos e relatórios; conferir migração de conclusão sem foto no banco isolado. Não usar dados reais de produção no teste.
5. **Lote 5 — preparação comercial.** Separação efetiva dos dados entre empresas, isolamento de permissões, identidade por empresa, preço/assinatura se solicitado, antes de comercializar.
6. **Publicação.** Somente após aceite, testes ponta a ponta e plano de rollback. Nenhuma troca de domínio nem migração em produção sem aprovação explícita.

## Testes
`node --test tests/v3/module-integrity.test.cjs`
`node --test tests/completion-no-photo/completion.test.cjs`
`node --test tests/agenda-clean/agenda-clean.test.cjs tests/finance-clean/finance-clean.test.cjs tests/navigation/direct-home-nav.test.cjs`

> Limites: testes estáticos não comprovam login, regras SQL, disponibilidade, execução em Android nem correção dos bugs relatados. Validar em homologação antes de qualquer liberação.

## Registro de alterações
| Data | Lote | Alteração | Produção | Verificação |
| --- | --- | --- | --- | --- |
| 27/10/2026 | 1 | Criação da V3 modular preservando V2, identidade visual inicial e teste de integridade | Não alterada | Testes automatizados e preview pendentes |
