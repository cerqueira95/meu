# Farol Operacional WMS — migração controlada (ambiente de desenvolvimento)

## Objetivo
Substituir **somente a navegação da Carta Controle TMA**, depois de validada em homologação, por um Farol Operacional integrado aos dados WMS do Warehouse. A antiga API/tabelas do Logan permanecem intactas para possível reversão e para preservar histórico e justificativas.

O HTML fornecido pelo usuário (`Farol_CARREGAMENTO_AMPLIADO (2).html`) contém **dados demonstrativos de agosto/2026 em base64** e armazenamento local em `localStorage/IndexedDB`. Esses dados **não foram copiados** para o banco da aplicação.

## Análise funcional do Farol original
1. Pontuação por colaborador, paletes finalizados, usuários identificados, média individual.
2. ELA médio e total, com meta de referência **19.880 pontos/colaborador/dia** presente no arquivo original.
3. Ranking e produtividade por hora e por usuário, com tabela de calor e cumulativo.
4. Fila de tarefas: separação, conferência, carregamento, fechamento, manobrista.
5. Jornadas noturnas: primeira atividade, retorno após intervalo, atividades após o horário de saída.
6. Filtros de data e hora, histórico das cargas e exportação.

## Fontes no Warehouse
| Medida | Fonte | Situação |
|---|---|---|
| Colaboradores | `usuarios`, `wms_login`, `matricula` | Já existe |
| Itens e quantidades | `wms_item_registros` | Já existe, captura sem pontuação |
| Paletes distintos por operador e hora | Agrupamento `data_ref,mapa,palete,usuario_login`, com `fim_texto` | Derivado dos itens, sujeito a homologação contra o WMS |
| Rateio | `wms_rateio_registros` | Já existe, **não equivaler automaticamente** a pontos por palete |
| Tarefas de separação/conferência/carregamento | `wms_tarefas_registros` e `/api/cron/tarefas` | Código existente, tabelas ausentes do banco Supabase inspecionado |
| Pontuação por palete (hora, nome, status) | Relatório *Tempo de Separação por Palete* do WMS | **Ainda não coletado; endpoint e formato de autenticação a confirmar** |
| ELA | Pontos diários / quantidade de colaboradores / meta diária | Bloqueado até haver pontuação oficial |
| Jornada/HE | Horários de atividade + escala formal, faltas, descanso e ponto | O Farol de prévia só mostra janela de atividade, **não declara horas extras** |

### Qualidade atual do banco
No Supabase inspecionado em 16/10/2026, `wms_item_registros` possui 161.407 linhas com `data_ref` de 01/09 a **03/10/2026**, portanto falta atualizar o intervalo 04–16/10 antes da migração. As tabelas `wms_tarefas_registros` e `wms_tarefa_coletas` ainda não existiam no banco. Isso precisa ser tratado antes de publicar a nova tela no lugar da Carta Controle TMA.

## Implementado nesta branch
- Nova API autenticada `GET /api/farol`, sem escrever em tabelas de produção.
- Filtros de início/fim, hora inicial/final, máximo de 31 dias.
- Agrupamento por operador/mapa/palete, evitando contar várias linhas de item como várias carretas/paletes.
- Métricas de paletes identificados, itens, unidades, operadores e produtividade por hora.
- Identificação do estado da coleta, incluindo data e fonte defasadas.
- Classificação das tarefas quando a tabela WMS correspondente estiver disponível.
- Frontend responsivo com ranking, visualização por hora, fluxo operacional e jornada observada.
- Pontuação/ELA explicitamente pendentes, sem inventar números.
- Substituição apenas na navegação **desta branch**. **Nenhuma mudança de produção foi publicada.**

## Etapas obrigatórias antes de implantar
1. Confirmar o endpoint oficial WMS do relatório **Tempo de Separação por Palete**, com as colunas `Data de Entrega; Mapa; Palete; Região - Separação; Usuário - Finalizou Palete; Pontuação; Endereço Destino; Início Palete; Fim Palete; Esforço; Status do Palete; Nome`, e identificar o formato real JSON/CSV do serviço.
2. Confirmar unidade, fuso e regra de deduplicação por palete e versão de status.
3. Validar os números do Farol piloto contra um CSV real WMS recente, sem usar o conteúdo de exemplo do HTML.
4. Corrigir/ativar cron WMS de separação e tarefas no banco efetivo; não modificar os CRON secrets. Na rota `/api/cron/rateio`, as coletas D0 já concluídas são ignoradas **salvo** `?fechamento=1`. A rota de tarefas também pode pular D0 concluído; para o Farol ser frequente, criar uma coleta D0 que atualize snapshots corretamente sem duplicar linhas.
5. Testar com 1 dia e com o turno noturno atravessando meia-noite, revisar escalas para não interpretar intervalo de atividade como jornada oficial.
6. Compilar o frontend, testar a API autenticada/sem login, conferir o Render e só então promover para `dev-local`.

**Observação:** este código é uma prévia técnica para homologação, e o painel TMA de produção não foi modificado.
