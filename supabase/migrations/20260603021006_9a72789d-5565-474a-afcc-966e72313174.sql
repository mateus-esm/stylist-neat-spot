
-- Storage policies for session-media bucket
-- Path convention: <appointment_id>/<uuid>.<ext>

CREATE POLICY "Admin full session-media objects"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'session-media' AND has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (bucket_id = 'session-media' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Patient reads own session-media"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'session-media'
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM public.appointments WHERE client_id = public.current_patient_client_id()
  )
);

CREATE POLICY "Patient uploads own session-media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'session-media'
  AND owner = auth.uid()
  AND (storage.foldername(name))[1]::uuid IN (
    SELECT id FROM public.appointments WHERE client_id = public.current_patient_client_id()
  )
);

CREATE POLICY "Patient deletes own session-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'session-media' AND owner = auth.uid());
