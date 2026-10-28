# Vaporeasy V3 — revisão modular do calendário (27/10/2026)

## Fonte examinada
`v3/scripts/calendar.js` na branch `v3/homologacao-modular-20261027` (291 linhas). Revisão estática; não equivale a teste funcional.

## Constatações
1. A listagem mensal usa consultas separadas para agendamentos e entidades associadas (clientes, veículos, serviços, equipes e colaboradores); os nomes são renderizados por templates HTML.
2. Nos trechos examinados, nomes de clientes, veículos, serviços, responsáveis e mensagens de erro passam por `esc(...)` antes da interpolação em `innerHTML`. A definição de `esc` e todos os consumidores devem ser considerados na revisão de segurança antes de afirmar proteção completa contra XSS.
3. O botão da listagem usa atributos `data-agenda-list-day` e `data-agenda-list-id` para navegar até o dia/agendamento; `data-agenda-list-id` é escapado. Verificar no teste de regressão a navegação com vários agendamentos no mesmo dia.
4. A tela operacional tem caminhos distintos para calendário, início do serviço e RG do veículo. Evitar refatoração conjunta desses fluxos, que dificultaria localizar regressões.
5. Existem várias atribuições de `innerHTML`; não substituir indiscriminadamente por `textContent`, pois parte do conteúdo contém marcação intencional.

## Plano de alteração pequena (não executado)
- Primeiro lote: extrair exclusivamente renderização da lista mensal em função pura, mantendo HTML e ordem de dados.
- Teste: comparar saída antes/depois com entradas fixas, incluindo caracteres especiais em nomes, e verificar seleção de dia/agendamento.
- Só depois revisar calendário operacional e RG, em commits separados.

## Limites
Nenhuma vulnerabilidade explorável foi comprovada; nenhum defeito foi corrigido nesta revisão. Nenhuma migração, banco, Edge Function, preview ou produção foi modificada.
