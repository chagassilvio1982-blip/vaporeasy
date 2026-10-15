# Cadência dos cuidados Premium — homologação (14/10/2026)

**Escopo:** somente banco isolado `wwivmyhlwqyzmaexkmnk` e branch `ux/planos-operacional-20261014`. Não aplicar a contratos existentes de outros veículos nem à V2 em produção.

## Regras comerciais confirmadas
- **Hidrorrepelente de para-brisa:** intervalo de **45 dias**.
- **Selante com grafeno da pintura:** intervalo de **45 dias**.
- **Hidratação do couro:** intervalo de **60 dias**, somente quando contratada e aplicável ao veículo.

Consulta direta à tabela `plan_care_templates` na homologação confirmou os três padrões acima. Os benefícios denominados `Hidro repelente` e `Selante Grafeno` já cadastrados no veículo utilizado para teste também estão configurados a cada 45 dias. A hidratação do couro está no catálogo, **não foi incluída automaticamente no contrato desse veículo**. Outras regras cadastradas em veículos de teste não foram alteradas nesta conferência.

O texto anterior deste documento mencionava erroneamente 45 dias para o couro; isso não corresponde à última orientação do usuário nem ao estado verificado do banco.

## Critério para a tela do técnico
O prazo é calculado a partir da **última aplicação confirmada**, e não da data de contratação ou de um agendamento. Aplicação em 14/10/2026: hidrorrepelente e grafeno ficam dentro do intervalo em 27/11 e alcançam 45 dias em 28/11; a hidratação do couro alcança 60 dias em 13/12. Quando não existe registro de execução, exibir **Conferir primeira aplicação**, sem inventar data.

## Segurança e rollback
O ajuste original foi realizado somente na base isolada, com checkpoint SQL em `tests/plan-care/rollback-hml-45-days-20261015.sql`. Esse arquivo reproduz o estado de teste anterior, **não deve ser executado em produção** nem automaticamente. Esta revisão documental e os testes de regressão não alteram registros de execução, cobranças, agenda ou contratos.
