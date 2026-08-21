
-- 1. Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'patient');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles insert" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles update" ON public.user_roles
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles delete" ON public.user_roles
  FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 2. Link patient login to client record
ALTER TABLE public.clients ADD COLUMN auth_user_id uuid UNIQUE;

CREATE OR REPLACE FUNCTION public.current_patient_client_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM public.clients WHERE auth_user_id = auth.uid() LIMIT 1
$$;

-- 3. Update RLS on existing tables to include patient access
DROP POLICY IF EXISTS "Users can view their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can create their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can update their own clients" ON public.clients;
DROP POLICY IF EXISTS "Users can delete their own clients" ON public.clients;

CREATE POLICY "Admin full clients" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient reads own client" ON public.clients FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
CREATE POLICY "Patient updates own client" ON public.clients FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can create their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can update their own appointments" ON public.appointments;
DROP POLICY IF EXISTS "Users can delete their own appointments" ON public.appointments;

CREATE POLICY "Admin full appointments" ON public.appointments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient reads own appointments" ON public.appointments FOR SELECT TO authenticated
  USING (client_id = public.current_patient_client_id());
CREATE POLICY "Patient requests appointment" ON public.appointments FOR INSERT TO authenticated
  WITH CHECK (client_id = public.current_patient_client_id() AND status = 'solicitado');
CREATE POLICY "Patient updates own appointment" ON public.appointments FOR UPDATE TO authenticated
  USING (client_id = public.current_patient_client_id());

DROP POLICY IF EXISTS "Users can view their own patient packages" ON public.patient_packages;
DROP POLICY IF EXISTS "Users can create their own patient packages" ON public.patient_packages;
DROP POLICY IF EXISTS "Users can update their own patient packages" ON public.patient_packages;
DROP POLICY IF EXISTS "Users can delete their own patient packages" ON public.patient_packages;

CREATE POLICY "Admin full packages" ON public.patient_packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient reads own packages" ON public.patient_packages FOR SELECT TO authenticated
  USING (client_id = public.current_patient_client_id());

-- 4. Availability slots
CREATE TABLE public.availability_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  status text NOT NULL DEFAULT 'aberto', -- aberto | bloqueado | reservado
  reason text,
  appointment_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_slots_date ON public.availability_slots(slot_date, start_time);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.availability_slots TO authenticated;
GRANT ALL ON public.availability_slots TO service_role;

ALTER TABLE public.availability_slots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full slots" ON public.availability_slots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient reads open slots" ON public.availability_slots FOR SELECT TO authenticated
  USING (status = 'aberto' OR (status = 'reservado' AND appointment_id IN (
    SELECT id FROM public.appointments WHERE client_id = public.current_patient_client_id()
  )));
CREATE POLICY "Patient reserves slot" ON public.availability_slots FOR UPDATE TO authenticated
  USING (status = 'aberto')
  WITH CHECK (status = 'reservado');

CREATE TRIGGER update_slots_updated_at
  BEFORE UPDATE ON public.availability_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Session exercises
CREATE TABLE public.session_exercises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  name text NOT NULL,
  sets integer,
  reps text,
  load text,
  rest_seconds integer,
  notes text,
  video_url text,
  order_index integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_exercises_appt ON public.session_exercises(appointment_id, order_index);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_exercises TO authenticated;
GRANT ALL ON public.session_exercises TO service_role;

ALTER TABLE public.session_exercises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full exercises" ON public.session_exercises FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Patient reads own exercises" ON public.session_exercises FOR SELECT TO authenticated
  USING (appointment_id IN (
    SELECT id FROM public.appointments WHERE client_id = public.current_patient_client_id()
  ));
CREATE POLICY "Patient marks own exercise done" ON public.session_exercises FOR UPDATE TO authenticated
  USING (appointment_id IN (
    SELECT id FROM public.appointments WHERE client_id = public.current_patient_client_id()
  ));

CREATE TRIGGER update_exercises_updated_at
  BEFORE UPDATE ON public.session_exercises
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
