
-- 1. SERVICES catalog
CREATE TABLE public.services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  default_duration_min integer NOT NULL DEFAULT 60,
  default_price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.services TO authenticated;
GRANT ALL ON public.services TO service_role;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full services" ON public.services
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Patient reads active services" ON public.services
  FOR SELECT TO authenticated
  USING (active = true);
CREATE TRIGGER update_services_updated_at
  BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. SESSION MEDIA
CREATE TABLE public.session_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  storage_path text NOT NULL,
  media_type text NOT NULL DEFAULT 'image',
  caption text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_session_media_appointment ON public.session_media(appointment_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_media TO authenticated;
GRANT ALL ON public.session_media TO service_role;
ALTER TABLE public.session_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full media" ON public.session_media
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Patient reads own media" ON public.session_media
  FOR SELECT TO authenticated
  USING (appointment_id IN (SELECT id FROM public.appointments WHERE client_id = current_patient_client_id()));
CREATE POLICY "Patient inserts own media" ON public.session_media
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND appointment_id IN (SELECT id FROM public.appointments WHERE client_id = current_patient_client_id())
  );
CREATE POLICY "Patient deletes own media" ON public.session_media
  FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- 3. Performance level on exercises
ALTER TABLE public.session_exercises
  ADD COLUMN IF NOT EXISTS performance text;

-- 4. Patient diary on appointments
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS patient_notes text;

-- 5. Packages enrichment
ALTER TABLE public.patient_packages
  ADD COLUMN IF NOT EXISTS service text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Seed initial services for existing admin(s)
INSERT INTO public.services (user_id, name, default_duration_min, default_price)
SELECT ur.user_id, s.name, s.dur, 0
FROM public.user_roles ur
CROSS JOIN (VALUES
  ('Liberação Miofascial', 60),
  ('Anamnese', 60),
  ('Eletroestimulação', 45),
  ('Pilates Clínico', 60),
  ('Reavaliação', 45)
) AS s(name, dur)
WHERE ur.role = 'admin'::app_role
ON CONFLICT DO NOTHING;
