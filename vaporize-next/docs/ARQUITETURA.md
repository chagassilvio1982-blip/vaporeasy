# Vaporize Next — Contrato de arquitetura v0.1
Data: 2026-10-29
Status: planejamento técnico; não é implantação.

## Escopo e isolamento
- Novo produto SaaS de gestão de estética automotiva; Vaporeasy será a primeira empresa.
- Código novo sob `vaporize-next/`; V2 e V3 legadas somente leitura.
- Supabase homologação: `cfpvexgkjsqpwhebsoos`; NÃO tocar no Supabase da V2 nem produção.
- Branch de trabalho: `vaporize-next/isolado-20261029`. Branch criada a partir da V3 apenas como ponto de versionamento; nenhum arquivo antigo será tratado como arquitetura Next.
- Não ativar Preview/produção sem revisar configuração de build para não publicar automaticamente a V3 como Next.

## Blocos (12)
01 auditoria/requisitos; 02 infraestrutura e modelo multiempresa; 03 autenticação/permissões; 04 design/navegação; 05 clientes/veículos; 06 serviços/equipes; 07 agenda; 08 execução; 09 planos; 10 financeiro/documentos; 11 SaaS/assinaturas; 12 homologação/migração/lançamento.

## Descobertas confirmadas (leitura)
- 27 tabelas públicas existentes no Supabase de homologação, todas com RLS habilitada.
- Pesquisa de colunas contendo tenant, business, company, org retornou somente `business_payment_settings.business_name`.
- Sem coluna de tenant explícita nas tabelas públicas existentes; RLS não equivale a isolamento multiempresa.
- Zero Edge Functions listadas.
- V2 staging e V3 possuem estrutura HTML/CSS legada; não reaproveitar sem revisão.

## Contrato de dados proposto — sujeito a migração e testes
- `next.organizations(id, name, slug, status, created_at)`
- `next.memberships(id, organization_id, user_id, role, status, created_at)`
- `next.clients(id, organization_id, ...)`; `next.vehicles(id, organization_id, client_id, ...)`
- Todas as entidades de negócio (serviços, colaboradores, equipes, agenda, planos, cobranças, despesas e documentos) terão `organization_id NOT NULL`.
- Chaves estrangeiras compostas onde necessário para impedir relações entre organizações.
- Acesso via auth.uid() e membership ativa, com RLS SELECT/INSERT/UPDATE/DELETE e privilégios mínimos.
- Não permitir ao usuário promover sua própria função ou transferir dados entre organizações.
- Isolamento também para Storage, Edge Functions e operações de backend.
- Migrações versionadas, reversíveis quando possível, com teste de isolamento A/B (usuário de empresa A não lê, edita ou apaga dados da B).

## Regras operacionais a confirmar em inventário funcional
- Cadastro de clientes e RG de veículos, fotos opcionais e histórico.
- Agenda com recorrência semanal/quinzenal, equipe, calendário, conflitos, conclusão e exceções.
- Planos e benefícios por competência, descontos, recibos agrupados e financeiro.
- Perfis proprietário, gerente, colaborador; acesso por permissões verificadas no servidor.
- SaaS com empresas segregadas e cobrança futura.

## Critério de conclusão por bloco
- Código versionado, testes executados, integração validada, evidências, relatório e pendências.
- Não declarar sucesso com base apenas em inspeção estática.
- Não migrar dados reais nem modificar V2/produção sem aprovação específica.

## Pendências imediatas
1. Completar inventário funcional da V2 sem modificá-la.
2. Especificar SQL de migração do schema Next e suíte de testes multiempresa; revisar antes de aplicar.
3. Isolar build/Preview para que a branch Next não exponha a aplicação V3 herdada.
