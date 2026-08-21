
-- 1. package_templates
CREATE TABLE public.package_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  default_sessions integer NOT NULL DEFAULT 10,
  default_price numeric NOT NULL DEFAULT 0,
  default_service text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.package_templates TO authenticated;
GRANT ALL ON public.package_templates TO service_role;
ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full package_templates" ON public.package_templates
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Patient reads active templates" ON public.package_templates
  FOR SELECT TO authenticated USING (active = true);
CREATE TRIGGER update_package_templates_updated_at
  BEFORE UPDATE ON public.package_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. session_plans
CREATE TABLE public.session_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  client_id uuid NOT NULL,
  appointment_id uuid,
  week_start date NOT NULL DEFAULT CURRENT_DATE,
  title text NOT NULL,
  content text NOT NULL DEFAULT '',
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_plans TO authenticated;
GRANT ALL ON public.session_plans TO service_role;
ALTER TABLE public.session_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin full session_plans" ON public.session_plans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Patient reads own plans" ON public.session_plans
  FOR SELECT TO authenticated USING (client_id = current_patient_client_id());
CREATE TRIGGER update_session_plans_updated_at
  BEFORE UPDATE ON public.session_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. availability_slots: reserved_for_client_id
ALTER TABLE public.availability_slots
  ADD COLUMN IF NOT EXISTS reserved_for_client_id uuid;

-- 4. Seed dos pacotes-padrão (atribuídos ao primeiro admin)
INSERT INTO public.package_templates (user_id, name, default_sessions, default_price, default_service)
SELECT ur.user_id, t.name, t.sessions, t.price, t.service
FROM (
  SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role LIMIT 1
) ur
CROSS JOIN (VALUES
  ('LCA - Reconstrução de joelho', 24, 3600, 'Reabilitação LCA'),
  ('Menisco', 16, 2400, 'Reabilitação meniscal'),
  ('Lombalgia', 12, 1800, 'Tratamento lombar'),
  ('Ombro', 12, 1800, 'Reabilitação de ombro'),
  ('Tornozelo', 10, 1500, 'Reabilitação tornozelo'),
  ('Quadril', 12, 1800, 'Reabilitação de quadril')
) AS t(name, sessions, price, service)
WHERE EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin'::app_role);
