## Correções Phase 3

### Bugs
1. **Encerrar pacote falha** — `Packages.tsx`: substituir `window.confirm` por `AlertDialog` + `toast.success`.
2. **Financeiro Recebido/Pendente errados** — `Financial.tsx` + `Packages.tsx`: padronizar filtro por mês+ano; `markPaid` deve gravar `paid_at`; `EvolutionSheet` não deve forçar `payment_status='pago'` em sessões de pacote (já são pagas).
3. **Badge R$ 0,00 ao vincular pacote** — `AppointmentForm.tsx`: esconder bloco de preço quando `packageId !== 'avulso'`.
4. **Campo serviço obrigatório com pacote** — `AppointmentForm.tsx`: quando vinculado a pacote, auto-preencher `service` com `selectedPackage.service` e pular validação.
5. **Contador 1/12 → 2/12 não incrementa** — criar `src/lib/appointmentCompletion.ts` com helper `completeAppointment(appointmentId)` que: atualiza `appointments.status='atendido'`, incrementa `patient_packages.completed_sessions` (idempotente via `package_session_index`), marca pacote `concluido` + `finished_at` ao atingir total. Usar em `AppointmentSheet.updateStatus` e `EvolutionSheet.handleSubmit`.
6. **Previsão de término absurda (agosto p/ 12 sessões)** — criar `src/lib/packageForecast.ts`: usar próximos agendamentos futuros com `package_id` se existirem; senão `hoje + (restantes × clients.return_days)`; default 7 dias.

### Nova feature
7. **Checklist pós-sessão (admin + paciente)** — em `PrescriptionTab.tsx` e `PatientSession.tsx`: checkbox por exercício (grava `completed_at`), seletor de performance (good/neutral/bad), % completude calculada, campo notas (`evolution_notes` admin / `patient_notes` paciente).

### Arquivos
- Novos: `src/lib/appointmentCompletion.ts`, `src/lib/packageForecast.ts`
- Editar: `Packages.tsx`, `Financial.tsx`, `AppointmentForm.tsx`, `AppointmentSheet.tsx`, `EvolutionSheet.tsx`, `PrescriptionTab.tsx`, `PatientSession.tsx`

Sem migrações novas (schema já suporta tudo).
