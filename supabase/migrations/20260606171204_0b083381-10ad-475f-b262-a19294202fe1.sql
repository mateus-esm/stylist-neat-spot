ALTER TABLE public.session_plans
  ADD COLUMN IF NOT EXISTS exercises text,
  ADD COLUMN IF NOT EXISTS scheduling text,
  ADD COLUMN IF NOT EXISTS tips text;