# Phase 2 — Finalização

Concluir os 3 itens pendentes da expansão Patient Portal + Admin.

## 1. Aba "Prescrição" no AppointmentSheet (Admin)
Adicionar nova aba dentro do `AppointmentSheet.tsx` ao lado das abas existentes:
- Lista de exercícios da sessão (`session_exercises` vinculados ao `appointment_id`)
- Form inline para adicionar: nome, séries, repetições, carga, observações
- Editar / remover linhas existentes
- Mostrar status de conclusão marcado pelo paciente (read-only para Lucas)
- Salvar via insert/update/delete em `session_exercises`

## 2. Banner de solicitações pendentes na Agenda
No topo de `Index.tsx` (Agenda do admin):
- Buscar `appointments` com `status = 'solicitado'`
- Card destacado em vermelho mostrando contagem ("3 horários solicitados")
- Lista expansível com: paciente, data/hora, botões **Aprovar** / **Recusar**
- Aprovar → `status = 'confirmada'` e marca `availability_slots.status = 'reservado'`
- Recusar → `status = 'cancelada'` e libera o slot de volta para `aberto`
- Atualiza em realtime ou refetch após ação

## 3. Atribuição do papel admin ao Lucas
Pedir o email do Lucas no chat após este plano ser aprovado. Em seguida, rodar migration/insert:
```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = '<email-do-lucas>';
```
Sem isso, ninguém consegue acessar a área admin.

## Arquivos afetados
- editar `src/components/AppointmentSheet.tsx` (nova aba Prescrição)
- editar `src/pages/Index.tsx` (banner de pendentes)
- criar `src/components/PendingRequestsBanner.tsx`
- insert SQL após receber o email do Lucas

## Fora do escopo
- Notificações push/email de aprovação
- Biblioteca reutilizável de exercícios (continua por sessão)
- Edição de exercício pelo paciente (só marca como feito)
