# Recorrência do Euripídio — investigação de 06/11/2026

## Relato
Carros agendados na quinta-feira em outubro, com repetição para os meses seguintes, apareceram na sexta-feira em novembro. Frequência efetivamente salva, datas, horários e IDs ainda não consultados. “Todos os meses” não comprova que o campo salvo seja `monthly`: pode ser semanal/quinzenal contínuo.

## Confirmado no repositório
1. `private.materialize_recurring_plan`, na migration `20261005145500_fix_scheduled_downgrade_plan_materialization.sql`, calcula semanal por +7 dias, quinzenal por +14 dias e demais frequências por `start_date + make_interval(months=>n)`. O cálculo mensal não consulta `weekday`.
2. `saveVehicleRG` envia `start_date:today()` tanto para criação como atualização da recorrência. Salvar o RG pode redefinir a âncora da série. Sem confirmar triggers remotos, não é possível afirmar seu efeito final no banco.
3. O arquivo legado `vaporeasy_recorrencia_veiculo.js` possui outra regra: mesma ocorrência do dia da semana (primeira quinta, segunda quinta etc.), usando última ocorrência disponível quando a quinta ocorrência não existe. Sua presença no repositório não comprova execução na V2 publicada.
4. Para outubro -> novembro/2026, repetir o número do dia transforma quinta em domingo, e não sexta. Portanto, o relato não pode ser explicado apenas pela soma de meses. É necessário verificar data inicial alterada, frequência salva, timezone e edição da ocorrência.

## Verificação necessária no ambiente integrado — somente leitura primeiro
- Localizar o cliente por cadastro, conferir veículos e seus IDs; não depender de grafia aproximada do nome.
- Ler recurring_plans: id, vehicle_id, frequency, weekday, start_date, local_time, active, updated_at.
- Ler appointments de outubro/novembro desses planos: id, starts_at, status, source, recurring_plan_id, idempotency_key, updated_at e deleted_at.
- Comparar starts_at em UTC com a conversão para schedule_settings.timezone (padrão no código: America/Sao_Paulo).
- Ler definição atual de materialize_recurring_plan e triggers de recurring_plans para comparar com o arquivo histórico.
- Verificar ocorrências alteradas manualmente e eventual substituição de plano.

## Regra de correção
- Repetição semanal ou quinzenal contínua deve manter quinta-feira e horário local, inclusive na virada do mês.
- Recorrência mensal por dia da semana deve preservar quinta e ordinal da data âncora. A regra de quinta ocorrência deve ser explícita (o legado já usa última disponível).
- Editar dados do veículo não deve reancorar silenciosamente um plano inalterado. Alterar frequência/dia/horário precisa de vigência definida.
- Não trocar apenas o texto do dia na interface: a data persistida deve estar correta.
- Não executar novamente a materialização de datas corrigidas sobre séries existentes sem reconciliar ocorrências futuras: a chave atual inclui data e poderia criar duplicatas em vez de mover as erradas.
- Preservar outubro, concluídos, pagamentos e ocorrências manuais. Correção das futuras exige plano de alteração por ID, verificação de conflitos e prevenção de duplicidade.

## Testes e status
`node --test tests/v2-recorrencia-diagnostico.test.cjs`: cinco testes de caracterização aprovados. Conferem algoritmo legado, quintas de outubro/novembro, regra de quinta ocorrência e os pontos de código identificados.

Esses testes documentam o defeito potencial e a divergência entre algoritmos; não são comprovação de correção no servidor. Não foi alterada geração de agendamentos, data de cliente, migração ou produção. A correção definitiva fica bloqueada pela ausência de conexão Supabase utilizável e de confirmação da regra/data efetivamente salvas. Nenhuma pergunta sobre informações já disponíveis no cadastro é necessária antes dessa consulta.
