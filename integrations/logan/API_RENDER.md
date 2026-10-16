# Logan → Warehouse | Conector API direto no Render

## Estado (16/10/2026)
- Preparado: consulta HTTPS dos relatórios Entradas e Saídas e Movimentações, sem Chrome e sem downloads locais.
- Preparado: fila do botão manual, janela de datas selecionada, idempotência existente, retornos e erros.
- Preparado: executor em `integrations/logan/cron-render.mjs` para o futuro Render Cron.
- **Não ativado**: acesso corporativo à API do Logan ainda precisa ser concedido e validado.
- O coletor Windows em execução NÃO foi desativado.

## Informações que a TI responsável pelo Logan deve confirmar
1. Se existe uma API de **consulta de relatórios** disponível para integrações terceiras em produção.
2. Forma **autorizada de autenticação não interativa** (OAuth2 client credentials com audience/scope, token de serviço, outra opção aprovada).
3. Permissões somente leitura dos relatórios e acesso à unidade CDD Salvador.
4. Endpoints permitidos, limitação de taxa e limites de data e paginação. Não presumir que as rotas internas do navegador são contratos públicos estáveis.
5. Se o servidor do Render precisa estar em uma allowlist de rede e como ocorre a rotação das credenciais.

Endpoints de exportação observados na interface, somente para conferência técnica:
- `GET https://logan.ambev.com.br/logan/gates/v1/reports/csv-report/`
- `GET https://logan.ambev.com.br/logan/gates/v1/reports/vehicle-movements/`

Eles rejeitaram GET sem autorização com **HTTP 401**. A disponibilidade para acesso de serviço **não foi confirmada**.

## Variáveis de ambiente para o Render
Todas devem ser configuradas no painel **Environment**, nunca em Git nem no chat:
- `LOGAN_DIRECT_ENABLED=true` — ativar **somente após** a primeira consulta autenticada testada com sucesso.
- `LOGAN_API_STRUCTURE_ID` — código da unidade autorizado.
- `LOGAN_API_LOCATIONS` — código(s) de localização autorizado(s).
- `LOGAN_API_LOCATION_TIMEZONE=America/Bahia` (padrão).
- **Uma** opção de autenticação, confirmada pela TI:
  - `LOGAN_API_SERVICE_TOKEN` — token de serviço de longa duração autorizado; ou
  - `LOGAN_API_TOKEN_URL`, `LOGAN_API_CLIENT_ID`, `LOGAN_API_CLIENT_SECRET`, `LOGAN_API_SCOPE` (opcional conforme provedor). Apenas se a API aceitar OAuth client credentials.
- `LOGAN_DATABASE_URL` — conexão do PostgreSQL já configurada; o WMS mantém seu `DATABASE_URL`.

Não reutilize cookies, MFA, usuário/senha pessoais ou tokens copiados do Chrome como credenciais de integração de produção.

## Funcionamento e troca do coletor
- Com `LOGAN_DIRECT_ENABLED` ausente, o botão continua usando o agente Windows.
- Depois de liberar o acesso de serviço, pare/desabilite a tarefa Windows **Warehouse Logan Coletor** antes de ligar o modo direto, para não competir pela mesma fila.
- O botão criará solicitação de um intervalo selecionado (até 31 dias). O Render processará a fila sem usuário no navegador.
- Os arquivos CSV recebidos em HTTPS ficam **somente em memória**; o resultado estruturado é salvo com transação na base Logan.
- No primeiro teste verifique status HTTP, totais e deduplicação antes de cron.
- A autenticação é específica do Logan: o exemplo de OAuth é compatível com client credentials, mas não é garantia de que o Logan aceite esse fluxo.

## Agendamento futuro, ainda NÃO criado/ativado
Criar um **Render Cron Job** após o teste autorizado:
- Repositório: `https://github.com/cerqueira95/meu.git`
- Branch: `dev-local`
- Workdir/root: repositório
- Build: `cd frontend && npm ci --no-audit --no-fund`
- Start: `node integrations/logan/cron-render.mjs --schedule`
- Schedule: `*/20 * * * *` (a cada 20 minutos, 24 horas/dia, inclusive virada de data, independentemente do fuso).
- Environment: mesmas credenciais do conector e `LOGAN_DATABASE_URL`; dar permissão estritamente necessária.

O agendamento utiliza janela de ontem e hoje em America/Bahia para contemplar operações atravessando meia-noite. A proteção contra duplicidades impede repetir linhas idênticas.

## Comandos de teste
```powershell
cd C:\Users\carla\Desktop\Warehouse-Logan-Test
node --test integrations\logan\testar-api-render.mjs
node integrations\logan\cron-render.mjs --schedule
```
Sem `LOGAN_DIRECT_ENABLED` e credenciais, o cron encerra sem consultar ou gravar dados.
