# CONTEXTO DO PROJETO — Warehouse / Armazém New

Este arquivo existe para permitir que outro chat/assistente retome o projeto rapidamente sem depender de memória informal.

## Produção atual

- Repositório: `cerqueira95/meu`
- Branch usada pelo Render: `dev-local`
- Serviço Render: `warehouse-orion`
- URL pública: `https://warehouse-orion.onrender.com`
- Runtime: Node
- Build: `cd frontend && npm ci && npm run build`
- Start: `cd frontend && node render-server.mjs`
- Banco principal: Neon/Postgres via `DATABASE_URL`
- Ambiente do Render deve possuir, entre outras, `DATABASE_URL`, `WMS_CREDENTIALS_KEY`, `CRON_SECRET` e `NODE_ENV`
- Nunca versionar valores reais de secrets.

## Arquivos importantes

- `frontend/render-server.mjs`: servidor Node usado no Render e mapa de rotas da API.
- `frontend/api/cron/rateio.js`: endpoint protegido da coleta automática.
- `frontend/api/_lib/wms-sync.js`: lógica principal de sincronização/coleta WMS.
- `frontend/api/_lib/wms-client.js`: integração com WMS e utilidades de data/fuso.
- `frontend/src/styles.css`: estilos da interface; contém correções responsivas do Armazém New.

## Cron / coleta diária WMS

Endpoint:
`GET /api/cron/rateio`

URL completa:
`https://warehouse-orion.onrender.com/api/cron/rateio`

Autorização:
`Authorization: Bearer <CRON_SECRET>`

O valor real de `CRON_SECRET` fica somente no ambiente seguro. Não colocar neste arquivo, commits, prints ou mensagens públicas.

### Agenda operacional atual

- Tentativa principal: 08:00 no fuso `America/Bahia`
- Tentativa de segurança: 08:02 no fuso `America/Bahia`
- Antes da coleta, pode-se chamar `GET /api/ping` para acordar o Render Free.
- O computador do usuário não precisa estar ligado para o cron em nuvem.

Observação: a agenda acima está configurada fora do código da aplicação. Ao retomar em outro chat, confirme se as automações continuam habilitadas antes de alterá-las.

## Regra crítica: não duplicar coleta

`frontend/api/cron/rateio.js` foi preparado para ser idempotente.

Antes de chamar a sincronização real, o endpoint consulta:
- `wms_rateio_coletas`
- `wms_item_coletas`

para a data atual da Bahia.

Se as duas coletas já estiverem com `status = 'ok'`, retorna HTTP 200 com:
- `status: "ok"`
- `skipped: true`
- mensagem de coleta já concluída

Assim, uma segunda chamada no mesmo dia (por exemplo às 08:02) não deve duplicar uma coleta que já terminou corretamente.

Se alguma parte ainda não estiver concluída, chama `collectCurrentRateio()`.

## Respostas esperadas do cron

- HTTP 200 + `skipped: false`: coleta executada.
- HTTP 200 + `skipped: true`: coleta do dia já existia; nenhuma repetição necessária.
- HTTP 401: `CRON_SECRET` ausente ou header de autorização incorreto.
- HTTP 405: método diferente de GET.
- HTTP 502: falha durante integração/coleta WMS; procurar `wms_cron_rateio_error` nos logs do Render.

## Render Free / cold start

O serviço pode adormecer por inatividade. Por isso uma chamada de aquecimento para `/api/ping` antes da coleta pode ser útil. Timeouts durante cold start não devem levar a remoção da proteção idempotente; retries são esperados e seguros apenas porque o endpoint verifica previamente o estado diário.

## Decisões recentes importantes

1. A antiga tentativa de agendar por GitHub Actions não se mostrou confiável para o horário desejado.
2. Foi testado cron externo, mas o fluxo atual usa automações em nuvem com tentativa principal e backup.
3. O endpoint foi alterado para evitar reprocessamento diário quando rateio e itens já concluíram.
4. A aplicação em produção está na branch `dev-local`, e não necessariamente em `main`.
5. O Render está com auto-deploy desligado; alterações no GitHub podem exigir deploy manual/trigger no Render.

## Armazém New — correção mobile

Foi corrigido um problema em que cards do feed ficavam estreitos no celular por causa de uma regra de grid posterior sobrescrevendo o responsivo.

A correção está em `frontend/src/styles.css`, com media queries que fazem `.news-layout.admin-layout` e `.news-layout.viewer-layout` virarem uma coluna em telas menores e protegem o texto contra quebra inadequada.

## Como retomar em outro chat

Peça ao assistente para:

1. Ler este arquivo primeiro.
2. Confirmar no Render que `warehouse-orion` ainda usa a branch `dev-local`.
3. Conferir o último deploy antes de publicar mudanças.
4. Não revelar ou substituir secrets sem necessidade.
5. Preservar a idempotência de `/api/cron/rateio`.
6. Antes de alterar cron, confirmar os horários ativos das automações.
7. Se editar código usado em produção, fazer commit na branch correta e só então disparar/verificar o deploy.

## Segurança

- Nunca registrar valores reais de `CRON_SECRET`, `DATABASE_URL`, credenciais WMS ou chaves privadas neste repositório.
- Exemplos de secrets vistos em conversa devem ser considerados comprometidos e não reutilizados como segredo de produção.
- Logs podem ser consultados para diagnóstico, mas devem evitar exposição de credenciais.

## Última atualização deste contexto

2026-09-29 — documentação criada para facilitar continuidade entre chats e comentários adicionados ao endpoint do cron.
