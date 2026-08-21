# Plano: Resumo comercial do Lucas Rocha Fisio APP

## Objetivo

Criar um **dossiê de produto** estruturado (em português, formato Markdown) que sirva para:

1. Alimentar a IA do usuário com o escopo exato do que foi construído.
2. Servir de base para vender o sistema para clínicas de fisioterapia (apresentação de funcionalidades, fluxos e proposta de valor).

## Formato pretendido

- Arquivo principal: `docs/produto-resumo.md` (Markdown semântico, fácil de parsear por IA).
- Opcional: gerar `docs/produto-resumo.docx` se o usuário quiser enviar para clínicas.
- Idioma: **português** (pode ajustar para inglês se solicitado).

## Conteúdo do dossiê

### 1. Resumo executivo

- O que é: sistema de operações clínicas para fisioterapia esportiva/ortopédica.
- Diferencial: agenda integrada a pacotes, portal do paciente, planejamento semanal e financeiro em tempo real.
- Público-alvo: fisioterapeutas autônomos e pequenas clínicas.

### 2. Personas e papéis

```text
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Admin/Owner   │  │  Staff (futuro) │  │     Paciente    │
│  (Lucas/Dono)   │  │  (não ativo hoje)│  │  (acesso portal)│
└────────┬────────┘  └─────────────────┘  └────────┬────────┘
         │                                          │
         ▼                                          ▼
  - Agenda, pacientes, pacotes,            - Visualiza sessões,
    financeiro, disponibilidade,             pacote ativo, exercícios
    planejamento, configurações              e mídia
  - Cria slots e bloqueios                 - Solicita horários
  - Prescreve exercícios                     abertos
  - Envia plano por WhatsApp
```

### 3. Módulos e funcionalidades (factual, baseado no código lido)

#### 3.1 Agenda (`/`)

- Visualizações: dia, semana, mês.
- Cards de agendamento com status (`agendado`, `confirmado`, `atendido`, `faltou`, `cancelado`, `solicitado`).
- Diferenciação visual entre sessões **Avulso** e **Pacote** (badge + índice da sessão).
- Integração com slots de disponibilidade abertos.
- Total financeiro do dia no header.

#### 3.2 Pacientes (`/pacientes`)

- Cadastro de pacientes com dados de contato.
- Histórico vinculado a agendamentos e pacotes.

#### 3.3 Retornos (`/retornos`)

- Lista de pacientes ausentes.
- Atalho para contato via WhatsApp.

#### 3.4 Disponibilidade/Slots (`/disponibilidade`)

- Criar slots individuais (aberto ou bloqueado).
- Criar slots em lote/recorrentes (`BulkSlotsDialog`).
- Reservar slot para paciente específico.
- Slots aparecem na agenda e no portal do paciente.

#### 3.5 Pacotes (`/pacotes`)

- Pacotes de sessões com nome, serviço, quantidade e preço.
- Modelos padrão (templates): LCA, Menisco, Lombalgia, Ombro, Tornozelo, Quadril.
- Contador de sessões realizadas (`completed_sessions/total_sessions`).
- Previsão automática de término (`packageForecast`).
- Marcar como pago / encerrar pacote.
- Ciclo de pagamento: quando concluído, reseta o tracker; status financeiro preservado.

#### 3.6 Planejamento (`/planejamento`)

- Plano semanal por paciente: objetivos, exercícios, agenda de sessões, dicas.
- Notificação via WhatsApp (`wa.me`) com formatação pronta.
- Histórico de planos e flag "Notificado".

#### 3.7 Financeiro (`/financeiro`)

- Filtros: dia, semana, mês, personalizado, tudo; por paciente e por serviço/pacote.
- Receita dividida entre **Avulsos** (só conta quando status = `atendido` e `pago`) e **Pacotes** (conta no mês do `paid_at`).
- Lista detalhada de entradas recebidas e pendentes.
- Gráfico de receita por dia (Recharts).
- Indicadores: ticket médio, sessões realizadas, pacotes ativos.

#### 3.8 Portal do Paciente (`/meu-app`)

- Login com papel `patient`.
- Visualiza pacote ativo, progresso e próximas sessões.
- Botão "Solicitar sessão" lista slots abertos e cria agendamento `solicitado`.
- Acesso a sessões passadas.

#### 3.9 Sessão do Paciente (`/meu-app/sessao/:id`)

- Visualiza exercícios prescritos.
- Marca exercícios como feitos.
- Registra nível de dor (pain scale).
- Visualiza mídias (fotos/vídeos) da sessão.

#### 3.10 Configurações (`/configuracoes`)

- Catálogo de serviços (sessões avulsas).
- Modelos de pacotes-padrão.
- Convite de pacientes (vincula registro clínico a conta de usuário).

### 4. Fluxos principais

#### Fluxo 1: Abrir horário → paciente solicita → admin confirma

1. Admin cria slot em `/disponibilidade` (individual ou em lote).
2. Paciente vê slots abertos no portal e clica "Solicitar sessão".
3. Sistema cria appointment `solicitado` e marca slot como `reservado`.
4. Admin confirma/ajusta na agenda.

#### Fluxo 2: Pacote → agendamentos → evolução → financeiro

1. Admin cria pacote para paciente (`/pacotes`), com template ou personalizado.
2. Na agenda, admin agenda sessão vinculada ao pacote (preço da sessão fica 0).
3. Ao marcar como `atendido`, `appointmentCompletion.ts` incrementa `completed_sessions`.
4. Pacote concluído: status muda para `concluido`/`encerrado`, tracker reseta.
5. Pagamento do pacote entra no financeiro no mês do `paid_at`.

#### Fluxo 3: Plano semanal → notificação

1. Admin cria plano em `/planejamento` com objetivos, exercícios, agenda e dicas.
2. Clica "Notificar WhatsApp" → abre `wa.me` com texto formatado.
3. Paciente recebe orientação no próprio celular.

### 5. Modelo de dados (tabelas principais)

- `clients` — pacientes, com `auth_user_id` para vincular ao login.
- `appointments` — agendamentos/sessões.
- `patient_packages` — pacotes de sessões.
- `package_templates` — modelos padrão de pacotes.
- `availability_slots` — horários disponíveis/reservados/bloqueados.
- `services` — catálogo de serviços avulsos.
- `session_plans` — planos semanais.
- `session_exercises` — exercícios prescritos por sessão.
- `session_media` — fotos/vídeos das sessões.
- `user_roles` — papéis `admin`/`patient`.

### 6. Stack e segurança

- **Frontend**: React 18 + Vite + TypeScript + Tailwind + shadcn/ui.
- **Backend**: Lovable Cloud (Supabase) — auth, Postgres, RLS, storage privado para mídia.
- **Segurança**: autenticação por e-mail/senha, RLS por usuário/papel, sem localStorage para dados sensíveis.
- **Instalável**: PWA com manifest e ícones.
- **Domínio**: custom domain já configurado (`fisioapp.soloventures.com.br`).

### 7. O que está incluído / o que ainda não está

**Incluído hoje:**

- Agenda, pacientes, pacotes, financeiro, disponibilidade, planejamento, portal do paciente, prescrição de exercícios, mídia por sessão, notificação WhatsApp, PWA, domínio customizado, múltiplos papéis (admin/patient).

**Excluído / para versões futuras** (conforme memória de escopo):

- Inteligência artificial.
- Multi-fisioterapeuta com permissões granulares (hoje só admin/patient).
- Controle de estoque.
- Pagamentos automáticos/integração com gateways.
- CRM/marketing avançado.

### 8. Proposta de valor comercial

- **Para o fisioterapeuta**: reduz o tempo de gestão, evita perda de receita com pendências visíveis e dá uma experiência profissional ao paciente.
- **Para o paciente**: tem acesso ao plano de tratamento, pode solicitar horários e acompanhar evolução no celular.
- **Diferenciais de venda**: portal do paciente, pacotes com previsão de término, planejamento semanal via WhatsApp e financeiro integrado.

### 9. Sugestão de precificação / pacotes de venda

- **Lite**: agenda + pacientes + financeiro básico.
- **Pro**: + pacotes, planejamento, portal do paciente.
- **Premium**: + múltiplos profissionais, pagamentos online, relatórios avançados (futuro).
- Pode ser vendido como **SaaS mensal por clínica** ou **licença única + manutenção**.

## Entregáveis

1. `docs/produto-resumo.md` (e opcional `.docx`).
2. (Opcional) `docs/matriz-venda.md` com checklist de funcionalidades por plano.

## Próximos passos

1. Você aprova o formato e o idioma.
2. Confirmo se quer também a versão DOCX/PDF.
3. Gero os arquivos sem alterar o código do app
  nâo precisa ser tão completo, so funcionalidades e objetivos que a gente desenvovler em um formato de texto simples