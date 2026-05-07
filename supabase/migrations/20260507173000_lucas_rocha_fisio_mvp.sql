ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS health_history text,
  ADD COLUMN IF NOT EXISTS underlying_conditions text,
  ADD COLUMN IF NOT EXISTS past_surgeries text,
  ADD COLUMN IF NOT EXISTS primary_complaints text;

CREATE TABLE IF NOT EXISTS public.patient_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  total_sessions integer NOT NULL DEFAULT 1 CHECK (total_sessions > 0),
  completed_sessions integer NOT NULL DEFAULT 0 CHECK (completed_sessions >= 0),
  price numeric(10,2) NOT NULL DEFAULT 0,
  payment_status text NOT NULL DEFAULT 'pendente' CHECK (payment_status IN ('pago', 'pendente')),
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'concluido', 'cancelado')),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own patient packages"
ON public.patient_packages FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own patient packages"
ON public.patient_packages FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own patient packages"
ON public.patient_packages FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own patient packages"
ON public.patient_packages FOR DELETE
USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS update_patient_packages_updated_at ON public.patient_packages;
CREATE TRIGGER update_patient_packages_updated_at
BEFORE UPDATE ON public.patient_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS package_id uuid REFERENCES public.patient_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS package_session_index integer,
  ADD COLUMN IF NOT EXISTS package_total integer,
  ADD COLUMN IF NOT EXISTS pain_scale integer CHECK (pain_scale IS NULL OR (pain_scale >= 0 AND pain_scale <= 10)),
  ADD COLUMN IF NOT EXISTS evolution_notes text,
  ADD COLUMN IF NOT EXISTS media_url text;

CREATE INDEX IF NOT EXISTS idx_patient_packages_client ON public.patient_packages(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_patient_packages_status ON public.patient_packages(user_id, status);
CREATE INDEX IF NOT EXISTS idx_appointments_package ON public.appointments(package_id);
