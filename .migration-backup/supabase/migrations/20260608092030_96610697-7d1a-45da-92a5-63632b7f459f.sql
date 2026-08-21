DROP POLICY IF EXISTS "Patient reads open slots" ON public.availability_slots;
DROP POLICY IF EXISTS "Patient reserves slot" ON public.availability_slots;

UPDATE public.availability_slots
SET status = 'aberto', updated_at = now()
WHERE reserved_for_client_id IS NOT NULL
  AND appointment_id IS NULL
  AND status = 'reservado';

CREATE POLICY "Patient reads open slots"
ON public.availability_slots
FOR SELECT
TO authenticated
USING (
  (
    status = 'aberto'
    AND (
      reserved_for_client_id IS NULL
      OR reserved_for_client_id = public.current_patient_client_id()
    )
  )
  OR (
    status = 'reservado'
    AND appointment_id IN (
      SELECT id
      FROM public.appointments
      WHERE client_id = public.current_patient_client_id()
    )
  )
);

CREATE POLICY "Patient reserves slot"
ON public.availability_slots
FOR UPDATE
TO authenticated
USING (
  status = 'aberto'
  AND (
    reserved_for_client_id IS NULL
    OR reserved_for_client_id = public.current_patient_client_id()
  )
)
WITH CHECK (
  status = 'reservado'
  AND appointment_id IS NOT NULL
  AND (
    reserved_for_client_id IS NULL
    OR reserved_for_client_id = public.current_patient_client_id()
  )
);