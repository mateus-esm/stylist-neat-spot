
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_min integer DEFAULT 30,
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'pago',
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS satisfaction integer,
  ADD COLUMN IF NOT EXISTS observations text;

INSERT INTO storage.buckets (id, name, public)
VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Service photos are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'service-photos');

CREATE POLICY "Users upload own service photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'service-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own service photos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'service-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own service photos"
ON storage.objects FOR DELETE
USING (bucket_id = 'service-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
