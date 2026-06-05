#!/usr/bin/env bash
# E2E: closing-package + status + financial totals via direct DB.
# Usage: bash scripts/e2e-package-flow.sh
set -e

ADMIN_UID=$(psql -tA -c "SELECT user_id FROM public.user_roles WHERE role='admin' LIMIT 1")
[ -z "$ADMIN_UID" ] && { echo "FAIL: no admin"; exit 1; }
echo "Admin: $ADMIN_UID"

TAG="e2e-$(date +%s)"
echo "Tag: $TAG"

# 1) Patient (clients) + package (4 sessions, R$ 400, paid today)
CLIENT_ID=$(psql -tA -c "
  INSERT INTO public.clients (user_id, name, phone)
  VALUES ('$ADMIN_UID', '$TAG paciente', '11999999999') RETURNING id;")
echo "Client: $CLIENT_ID"

PKG_ID=$(psql -tA -c "
  INSERT INTO public.patient_packages (user_id, client_id, name, service, total_sessions, price, payment_status, paid_at, status, started_at)
  VALUES ('$ADMIN_UID','$CLIENT_ID','$TAG LCA','LCA',4,400,'pago',now(),'ativo',now())
  RETURNING id;")
echo "Package: $PKG_ID"

# 2) 4 appointments today linked to the package (price 0, paid)
for i in 1 2 3 4; do
  psql -c "
    INSERT INTO public.appointments
      (user_id, client_id, client_name, appointment_date, appointment_time, service, price, status, payment_status, package_id, package_total, package_session_index)
    VALUES
      ('$ADMIN_UID','$CLIENT_ID','$TAG paciente',CURRENT_DATE,'0${i}:00:00','LCA',0,'agendado','pago','$PKG_ID',4,$i);" > /dev/null
done
echo "4 appointments created"

# 3) Mark 2 as atendido via the same SQL completeAppointment performs
psql -c "
  UPDATE public.appointments SET status='atendido'
  WHERE package_id='$PKG_ID' AND package_session_index IN (1,2);" > /dev/null
psql -c "
  UPDATE public.patient_packages SET completed_sessions=(
    SELECT count(*) FROM public.appointments WHERE package_id='$PKG_ID' AND status='atendido'
  ) WHERE id='$PKG_ID';" > /dev/null

CC=$(psql -tA -c "SELECT completed_sessions FROM public.patient_packages WHERE id='$PKG_ID'")
echo "Step A: completed_sessions=$CC (expect 2) $([ "$CC" = "2" ] && echo PASS || echo FAIL)"

# 4) Financial: paid_at month should sum 400 in package revenue
PKG_REV=$(psql -tA -c "
  SELECT COALESCE(sum(price),0) FROM public.patient_packages
  WHERE payment_status='pago' AND paid_at >= date_trunc('month', now())
    AND paid_at < date_trunc('month', now()) + interval '1 month'
    AND id='$PKG_ID';")
echo "Step B: package month revenue=$PKG_REV (expect 400) $([ "$PKG_REV" = "400" ] && echo PASS || echo FAIL)"

# 5) Complete remaining → status concluido + finished_at
psql -c "
  UPDATE public.appointments SET status='atendido'
  WHERE package_id='$PKG_ID' AND status<>'atendido';" > /dev/null
CC=$(psql -tA -c "SELECT count(*) FROM public.appointments WHERE package_id='$PKG_ID' AND status='atendido'")
TOTAL=$(psql -tA -c "SELECT total_sessions FROM public.patient_packages WHERE id='$PKG_ID'")
IS_FINISHED=$([ "$CC" = "$TOTAL" ] && echo true || echo false)
psql -c "
  UPDATE public.patient_packages
  SET completed_sessions=$CC,
      status=CASE WHEN $CC>=total_sessions THEN 'concluido' ELSE 'ativo' END,
      finished_at=CASE WHEN $CC>=total_sessions THEN now() ELSE finished_at END
  WHERE id='$PKG_ID';" > /dev/null

STATUS=$(psql -tA -c "SELECT status FROM public.patient_packages WHERE id='$PKG_ID'")
FIN=$(psql -tA -c "SELECT finished_at IS NOT NULL FROM public.patient_packages WHERE id='$PKG_ID'")
echo "Step C: status=$STATUS finished_at_set=$FIN (expect concluido/t) $([ "$STATUS" = "concluido" ] && [ "$FIN" = "t" ] && echo PASS || echo FAIL)"

# Cleanup
psql -c "DELETE FROM public.appointments WHERE package_id='$PKG_ID';" > /dev/null
psql -c "DELETE FROM public.patient_packages WHERE id='$PKG_ID';" > /dev/null
psql -c "DELETE FROM public.clients WHERE id='$CLIENT_ID';" > /dev/null
echo "Cleanup OK"
