-- RASCUNHO DE MIGRAÇÃO. NÃO EXECUTAR NA V2 OPERACIONAL.
-- Ref. PR #33, Novembro/2026. Primeiro aplicar/testar em Supabase isolado ativo.
-- Objetivo: documentos consolidados (pacote + avulso), sem colidir com
-- public.monthly_receipt_snapshots (UNIQUE por cliente e mês).
--
-- Precondições verificadas no projeto Vaporeasystaginx:
--   private.is_active_user(), private.current_app_role()
--   public.clients, auth.users.
-- A versão publicada usa o mesmo Supabase que o preview da V2.
--
-- ESCRITA EXCLUSIVA pelo backend validado com service_role;
-- nenhum INSERT/UPDATE/DELETE é autorizado diretamente a clientes.

create table public.consolidated_document_snapshots (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete restrict,
    competence_month date not null,
    document_kind text not null check (document_kind in ('statement','receipt')),
    revision integer not null check (revision >= 1),
    source_hash text not null check (source_hash ~ '^[0-9a-f]{64}$'),
    supersedes_id uuid references public.consolidated_document_snapshots(id) on delete restrict,
    snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
    issued_by uuid not null references auth.users(id) on delete restrict,
    issued_at timestamptz not null default now(),
    created_at timestamptz not null default now(),
    constraint consolidated_snapshot_month_start check (
        competence_month = date_trunc('month',competence_month::timestamp)::date
    ),
    constraint consolidated_snapshot_revision_unique unique (
        client_id, competence_month, document_kind, revision
    ),
    constraint consolidated_snapshot_source_unique unique (
        client_id, competence_month, document_kind, source_hash
    )
);

create index consolidated_snapshot_client_date
    on public.consolidated_document_snapshots (client_id, competence_month desc, issued_at desc);

alter table public.consolidated_document_snapshots enable row level security;
revoke all on table public.consolidated_document_snapshots from PUBLIC, anon, authenticated;
grant select on public.consolidated_document_snapshots to authenticated;

create policy consolidated_snapshot_finance_read
    on public.consolidated_document_snapshots
    for select to authenticated
    using (
        private.is_active_user()
        and private.current_app_role() in ('owner','admin')
    );

-- Proteção em profundidade: mesmo papel privilegiado não deve modificar
-- um documento já emitido. Correções exigem nova revisão.
create function private.prevent_consolidated_snapshot_mutation()
returns trigger language plpgsql set search_path = pg_catalog as $func$
begin
    raise exception 'Documento consolidado imutável; emitir uma nova revisão.'
        using errcode = '23514';
end;
$func$;

revoke all on function private.prevent_consolidated_snapshot_mutation() from PUBLIC;

create trigger consolidated_snapshot_immutable
before update or delete on public.consolidated_document_snapshots
for each row execute function private.prevent_consolidated_snapshot_mutation();

-- Não há política INSERT. Uma função Edge autenticada deverá:
--  1) verificar JWT no Auth, perfil financeiro ativo e pertencimento do cliente;
--  2) ler no banco TODOS os pagamentos/competências/veículos e descartar valores
--     enviados pelo navegador (o cliente envia apenas IDs de origem selecionados);
--  3) validar que os itens são do mesmo cliente e mês, sem duplicatas;
--  4) distinguir serviços cobertos pelo pacote, pagamentos quitados,
--     pendências e créditos de upgrade sem dupla soma;
--  5) proibir tipo "receipt" se houver qualquer valor pendente ou inconsistente;
--  6) gerar source_hash SHA-256 canônico (IDs+valores+status+tipo) no servidor;
--  7) emitir revisão em transação, com controle de concorrência
--     e retorno idempotente para o mesmo source_hash;
--  8) gravar issued_by = auth.uid() validado e snapshot imutável;
--  9) assinar/logar a emissão e permitir reenvio sem criar outra cobrança.
--
-- NÃO HABILITAR EM PRODUÇÃO antes dos testes no banco isolado e verificação RLS.
