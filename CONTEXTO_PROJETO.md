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


## Módulo Atividades — início da migração

Em 2026-09-29 começou a migração das atividades antigas em PHP para o Warehouse atual.

### Primeiro módulo: 5S

O comportamento original do arquivo PHP foi preservado como referência:
- quem lança conta automaticamente como participante principal;
- podem ser selecionados ajudantes;
- é possível selecionar várias áreas no mesmo lançamento;
- cada área exige foto;
- Picking possui subáreas/ruas;
- existe bloqueio de duplicidade por pessoa + área + dia;
- lançamento reprovado não bloqueia novo lançamento da mesma área;
- valor inicial do 5S permanece em R$ 1,00 por área / pessoa.

### Mudança estrutural importante

No sistema antigo, um mesmo lançamento criava um registro separado para cada participante, fazendo o ADM enxergar várias atividades para aprovar.

No Warehouse novo, o lançamento passa a ser um GRUPO único:
- uma linha principal em `atividade_lancamentos`;
- participantes em `atividade_lancamento_participantes`;
- áreas/evidências em `atividade_lancamento_itens`.

Assim o ADM aprova ou reprova uma vez e a decisão vale para todos os participantes do grupo.

A fila administrativa permite:
- aprovar o grupo;
- reprovar o grupo com motivo;
- editar um lançamento pendente antes da aprovação;
- visualizar participantes, áreas, fotos, valor individual e valor total do grupo.

### Arquivos novos

- `frontend/api/_lib/activities.js`
- `frontend/api/activities/5s.js`
- `frontend/api/activities/admin.js`
- `frontend/src/components/ActivitiesScreen.jsx`
- `frontend/src/components/ActivitiesScreen.css`

Rotas:
- `GET/POST /api/activities/5s`
- `GET/POST /api/activities/admin`

A navegação `Atividades` é exibida para perfis `Ajudante` e `ADM`.

As tabelas do módulo são criadas de forma idempotente na primeira utilização da API. Evidências são armazenadas no banco como imagem compactada para não depender do filesystem efêmero do Render.


### Aprovação ADM e notificações do grupo

A fila administrativa ganhou acesso próprio no menu do ADM: `Aprovar atividades`.

Ao aprovar ou reprovar um lançamento:
- a decisão continua sendo feita uma única vez por grupo;
- todos os participantes recebem uma notificação individual;
- na reprovação, o motivo informado pelo ADM vai dentro da notificação;
- o motivo também aparece no histórico de 5S de todos os participantes;
- notificações de atividades entram no sino global do Warehouse.

Tabela nova: `atividade_notificacoes`.
Rota: `GET/POST /api/activities/notifications`.

A interface de Atividades/5S possui regras responsivas específicas e deve continuar funcional no mobile.


### Valores das atividades editáveis pelo ADM

Foi criada uma tela administrativa chamada `Valores das atividades`.

Objetivo:
- permitir alterar valores unitários sem editar código;
- manter os lançamentos antigos com o valor histórico salvo no momento do lançamento;
- fazer novos lançamentos usarem o valor vigente no catálogo.

Tabela: `atividade_catalogo`.
Rota: `GET/POST /api/activities/settings`.
Tela: `frontend/src/components/ActivityValuesScreen.jsx`.

Valores iniciais cadastrados:
- 5S: R$ 1,00;
- Amarração: R$ 5,00.

O 5S já passou a buscar o valor no catálogo. Novos módulos devem usar `getActivityConfig(chave)` para obter o valor configurado pelo ADM.


### Atividade Amarração

A atividade Amarração foi migrada para o Warehouse com base no fluxo PHP legado.

Regras preservadas:
- Mapa/OP obrigatório e normalizado em maiúsculas;
- placa do cavalo obrigatória e normalizada para letras/números;
- foto de evidência obrigatória;
- segundo ajudante opcional;
- quando há segundo ajudante, o mesmo lançamento agrupa os dois participantes;
- Mapa/OP não pode ser repetido em outro lançamento não reprovado;
- valor vem do catálogo administrativo de atividades (inicialmente R$ 5,00);
- aprovação/reprovação continua sendo feita uma única vez por grupo;
- todos os participantes recebem as notificações já existentes no módulo Atividades.

Arquivos:
- \`frontend/api/activities/amarracao.js\`
- \`frontend/src/components/AmarracaoScreen.jsx\`

Rota:
- \`GET/POST /api/activities/amarracao\`

Os detalhes específicos (Mapa/OP, placa, segundo ajudante) ficam em \`atividade_lancamentos.detalhes\` (JSONB).
