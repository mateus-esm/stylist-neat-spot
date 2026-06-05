## Escopo aprovado

### 1. Teste E2E (script Node no banco)
- `scripts/e2e-package-flow.ts` (executado via `bunx tsx`):
  1. Cria paciente fake + pacote 4 sessões + 4 appointments.
  2. Marca pacote como pago (paid_at = hoje).
  3. Chama lógica equivalente a `completeAppointment` para 2 sessões.
  4. Lê `patient_packages.completed_sessions` (espera 2) e Financeiro do mês (espera price do pacote em Recebido).
  5. Conclui as 4 → espera status `concluido`, finished_at preenchido.
  6. Imprime PASS/FAIL por etapa, limpa dados fake ao final.

### 2. Financeiro — corrigir e expandir
**Root cause confirmado** lendo `Financial.tsx`: filtra appointments por `appointment_date` no mês mas só conta `payment_status='pago'` no Recebido. Quando marca atendido via `completeAppointment`, NÃO altera `payment_status`. Pacotes só entram se `paid_at` no mês — `markPaid` em `Packages.tsx` precisa gravar `paid_at=now()`.

**Correções:**
- `appointmentCompletion.ts`: ao concluir avulso (sem package_id), setar `payment_status='pago'` (regra: atender = receber, sem cobrança separada).
- `Packages.tsx markPaid`: garantir `paid_at: new Date().toISOString()` no update.
- `EvolutionSheet`: remover qualquer override de payment_status para sessões de pacote.

**Filtros novos em `Financial.tsx`:**
- Período: dia / semana / mês / customizado (date range picker).
- Cliente (select com busca).
- Tipo de pacote/serviço (LCA, Menisco, etc).
- Totais recalculam reativamente.

### 3. Catálogo de Pacotes-Padrão (LCA, Menisco, etc)
- Nova tabela `package_templates` (id, user_id, name, default_sessions, default_price, default_service, active).
- Seed inicial: LCA, Menisco, Lombalgia, Ombro, Tornozelo, Quadril.
- `Settings.tsx`: nova seção "Pacotes padrão" — CRUD igual ao ServiceManager.
- `Packages.tsx` criar pacote: dropdown de templates + opção "Personalizar".

### 4. Slots em massa (recorrente + lote)
- Em `Availability.tsx`:
  - Botão **"Abrir horários em lote"** → modal com:
    - Modo A: Recorrente (dias da semana × faixa horária × duração × número de semanas).
    - Modo B: Avulso múltiplo (lista de data+hora; gerar todas).
  - Campo opcional "Reservar para paciente" (select) — se preenchido, slot já fica `status='reservado'` vinculado àquele cliente (novo campo `reserved_for_client_id` em availability_slots).
- Migration: adicionar `reserved_for_client_id uuid` em `availability_slots`.

### 5. Plano da sessão + notificação WhatsApp
- Nova tabela `session_plans` (id, user_id, client_id, appointment_id nullable, week_start date, title, content text, created_at) — ou reuso de `appointments.evolution_notes` como plano prévio? **Decisão**: tabela nova porque pode ser plano semanal independente de uma sessão.
- Nova página `/planejamento` (admin): lista pacientes, cria/edita plano da semana, botão **"Enviar WhatsApp"** → `wa.me/<phone>?text=<plano formatado>`.
- Em `AppointmentSheet` aba **Plano**: mostra plano vigente do paciente + botão notificar.
- Paciente vê em `PatientPortal`.

### Arquivos
**Novos:** `scripts/e2e-package-flow.ts`, `src/pages/Planning.tsx`, `src/components/BulkSlotsDialog.tsx`, `src/components/PackageTemplateManager.tsx`, `src/components/SessionPlanEditor.tsx`.
**Migrations:** 1 para `package_templates` (+seed), 1 para `session_plans`, 1 para coluna `reserved_for_client_id`.
**Edits:** `Financial.tsx` (filtros), `Packages.tsx` (paid_at + templates), `appointmentCompletion.ts` (payment_status avulso), `Settings.tsx` (nova seção), `Availability.tsx` (botão lote), `AppointmentSheet.tsx` (aba plano), `PatientPortal.tsx` (mostrar plano), `BottomNav.tsx`/`App.tsx` (rota /planejamento), `EvolutionSheet.tsx` (limpar override).

### Ordem de execução
1. Migrations (3) — aprovar.
2. Código (financeiro + completion + templates + slots + planos).
3. Script E2E + rodar e mostrar resultado.

Sem mexer em AI, sem mudar design system. Tudo dentro do padrão McKinsey atual.