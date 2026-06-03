
# Plano de melhorias

## 1. Catálogo de serviços gerenciável
- Nova tabela `services` (nome, duração padrão, preço padrão, ativo) — Lucas gerencia em **/configuracoes** (nova rota).
- Em `AppointmentForm`: dropdown carregado da tabela + opção "Outro (texto livre)". Ao escolher serviço cadastrado, auto-preenche preço/duração.
- Seed inicial: Liberação Miofascial, Anamnese, Eletroestimulação, Pilates Clínico, Reavaliação.

## 2. Sessão (admin + paciente)
**Mídia compartilhada** — nova tabela `session_media` (appointment_id, url, tipo foto/vídeo, uploaded_by, caption). Bucket `session-media` (privado, RLS por appointment).
- Em `AppointmentSheet` (Lucas): nova aba "Mídia" para upload + galeria.
- Em `PatientSession` (paciente): seção "Minhas evidências" com upload e galeria compartilhada.

**Exercícios com nível de execução** — adicionar coluna `performance` em `session_exercises` (enum `good | neutral | bad`). Paciente marca ao concluir; Lucas vê na prescrição.

**Diário do paciente** — coluna `patient_notes` em `appointments` (texto livre que o paciente edita para acompanhar progresso, separado de `observations` do Lucas).

## 3. Regra de preço com pacote ativo
- Em `AppointmentForm`, ao selecionar paciente: detectar `patient_packages` com `status='ativo'`. Mostrar toggle "Vincular a pacote: [nome] (3/10)". Se vinculado → `price = 0`, `payment_status = 'pago'`, grava `package_id`.
- Avulso continua exigindo preço.

## 4. Gestão de pacotes ativos
- Nova página **/pacotes** (admin): lista de pacotes ativos com filtros por **paciente** e **tipo de serviço** (adicionar coluna `service` em `patient_packages`).
- Cada card mostra: paciente, progresso (3/10), valor pago/pendente, **previsão de término** (calculada pela média de sessões/semana do paciente), status.
- CTA: criar pacote, marcar como pago, encerrar.

## 5. Financeiro corrigido
Problema atual: `Financial.tsx` soma `appointments.price` de status `atendido` — ignora pacotes (pagos antecipadamente) e conta sessões de pacote como R$ 0.

Correção:
- **Receita = ** soma de `patient_packages.price` com `payment_status='pago'` no mês **+** soma de `appointments.price` (avulsos atendidos, sem `package_id`) no mês.
- **Pendente = ** pacotes `pendente` + avulsos atendidos com `payment_status='pendente'`.
- Gráfico diário: distribuir pacote no dia do pagamento; avulsos no dia da sessão.
- Cards extras: nº de pacotes em execução, ticket médio, previsão de fechamento.

## 6. Detalhes técnicos

**Migrations**
```sql
CREATE TABLE public.services (id, user_id, name, default_duration_min, default_price, active, ...);
CREATE TABLE public.session_media (id, appointment_id, url, media_type, uploaded_by, caption, ...);
ALTER TABLE public.session_exercises ADD COLUMN performance TEXT; -- good|neutral|bad
ALTER TABLE public.appointments ADD COLUMN patient_notes TEXT;
ALTER TABLE public.patient_packages ADD COLUMN service TEXT, ADD COLUMN paid_at TIMESTAMPTZ;
```
+ GRANTs + RLS (admin full; paciente lê/escreve nas próprias).

**Storage**: bucket `session-media` privado; políticas baseadas em appointment ownership.

**Arquivos a criar/editar**
- novos: `src/pages/Settings.tsx`, `src/pages/Packages.tsx`, `src/components/MediaTab.tsx`, `src/components/ServiceManager.tsx`, `src/components/PackageCard.tsx`
- editar: `AppointmentForm.tsx` (dropdown + pacote), `AppointmentSheet.tsx` (aba Mídia), `PrescriptionTab.tsx` (performance), `PatientSession.tsx` (mídia + diário + performance), `Financial.tsx` (fórmula), `App.tsx` + `BottomNav.tsx` (rotas).

## Fora de escopo (confirmar se quiser)
- Notificações push de novos uploads.
- Comparação visual antes/depois automática.
