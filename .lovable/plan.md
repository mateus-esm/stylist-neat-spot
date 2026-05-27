# Plano: Portal do Paciente + Painel Admin

Expansão do app para dois papéis (Admin/Lucas e Paciente), mantendo todo o trabalho atual da Fase 1 e adicionando: convite por email, agenda com solicitação de horário, registro de sessões pelo paciente e treinos anexados por sessão.

## 1. Modelo de papéis

Tabela dedicada `user_roles` + enum `app_role` (`admin`, `patient`) — nunca armazenar role em `profiles` (evita escalonamento de privilégio). Função `has_role(uuid, app_role)` SECURITY DEFINER usada em todas as RLS.

Vínculo paciente ↔ login: nova coluna `clients.auth_user_id` (uuid, nullable, unique). Quando o paciente aceita o convite, o registro `clients` correspondente recebe o `auth_user_id`. Assim Lucas continua dono dos prontuários e o paciente vê apenas o próprio.

## 2. Convite por email

- Lucas cria o paciente em `/pacientes` como hoje, e clica **"Enviar convite"**.
- Edge function `invite-patient` chama `supabase.auth.admin.inviteUserByEmail` com `redirectTo` → `/aceitar-convite`.
- Email customizado (template "invite") com branding Sport Red via templates de auth do Lovable.
- Na página `/aceitar-convite`: paciente define senha, recebe role `patient` e o `clients.auth_user_id` é gravado por trigger/edge function.

## 3. Agenda — slots e solicitações

Nova tabela `availability_slots` (data, hora início/fim, status: `aberto` | `bloqueado` | `reservado`, motivo opcional). Lucas gerencia em uma nova aba na Agenda ("Disponibilidade") e pode bloquear intervalos.

Fluxo do paciente:
- `/meu-app` (portal): vê próximas sessões, pacote ativo com progresso, e botão **"Solicitar sessão"**.
- Lista apenas slots `aberto`. Ao solicitar, cria `appointments` com `status='solicitado'` e marca o slot como `reservado`.
- Lucas vê banner "X solicitações pendentes" na Agenda e aprova/recusa via Sheet existente. Aprovar → `status='agendado'`; recusar → libera o slot.

## 4. Registro de sessão pelo paciente

Na tela da sessão do paciente:
- Botão **"Cheguei / Iniciar"** marca `appointments.status='em_andamento'` e `started_at`.
- Após a sessão, paciente preenche dor (escala 0–10) e observações livres → grava em `appointments.pain_scale` / `observations` (campos já existem).
- Se for sessão de pacote, o tracker `patient_packages.completed_sessions` incrementa apenas quando Lucas marca como `concluida` (regra de billing preservada).

Progresso visível: card com `completed_sessions / total_sessions` + `Progress` bar + histórico de últimas 5 sessões com dor/observações.

## 5. Treinos por sessão

Nova tabela `session_exercises` (1‑N com `appointments`):
- `name`, `sets`, `reps`, `load`, `rest_seconds`, `notes`, `video_url` (opcional), `order_index`.

UI:
- No `AppointmentSheet` (Lucas): nova aba **"Prescrição"** para adicionar/editar exercícios da sessão.
- No portal do paciente: tela "Minha sessão" mostra a lista de exercícios prescritos, com checkbox "feito" (campo `completed_at` em `session_exercises`).

## 6. Rotas e navegação

```text
/                    Admin: Agenda (atual)
/pacientes           Admin
/retornos            Admin
/financeiro          Admin
/disponibilidade     Admin (novo) — gerencia slots e bloqueios
/aceitar-convite     Público
/meu-app             Paciente — dashboard
/meu-app/sessao/:id  Paciente — detalhe da sessão + exercícios
```

`App.tsx` decide redirecionamento pós-login a partir da role: admin → `/`, paciente → `/meu-app`. BottomNav recebe variantes por role.

## 7. Segurança (RLS)

- `clients`, `appointments`, `patient_packages`, `session_exercises`, `availability_slots`: admin (via `has_role`) tem acesso total; paciente só lê/edita linhas onde `client_id` mapeia para seu `auth_user_id` (via security‑definer helper `current_patient_client_id()` para evitar recursão).
- `availability_slots`: paciente faz SELECT em slots `aberto` e UPDATE apenas para reservar (validado por trigger).
- `user_roles`: SELECT pelo próprio usuário; INSERT/DELETE só pelo admin.

## 8. Entregáveis técnicos

- Migrations: enum `app_role`, tabelas `user_roles`, `availability_slots`, `session_exercises`; coluna `clients.auth_user_id`; funções `has_role`, `current_patient_client_id`; trigger de reserva de slot; novo `status='solicitado'` permitido em `appointments`.
- Edge function `invite-patient` (admin-only).
- Templates de email de auth com identidade Sport Red.
- Hook `useRole()` + guard de rota.
- Páginas novas: `Disponibilidade.tsx`, `AcceptInvite.tsx`, `PatientPortal.tsx`, `PatientSession.tsx`.
- Extensão de `AppointmentSheet` com aba "Prescrição" e ações de aprovar/recusar solicitação.

## 9. Fora deste escopo

Notificações push/WhatsApp, biblioteca reutilizável de exercícios, plano de treino independente da sessão, multi-staff, reagendamento pelo paciente. Tudo isso fica para fases seguintes.
