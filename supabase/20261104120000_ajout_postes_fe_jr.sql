-- Ajout des postes FE (Jour Férié) et JR (Jour Récupération)
-- Rétrocompatible : les valeurs existantes restent valides.

BEGIN;

ALTER TABLE public.planning_lignes
  DROP CONSTRAINT IF EXISTS poste_valide,
  ADD CONSTRAINT poste_valide CHECK (poste = ANY (ARRAY['M','T','S','R','C','MAL','AT','FOR','HN','FE','JR']));

ALTER TABLE public.planning_encadrement_lignes
  DROP CONSTRAINT IF EXISTS poste_enc_valide,
  ADD CONSTRAINT poste_enc_valide CHECK (poste = ANY (ARRAY['M','T','S','R','C','MAL','AT','FOR','HN','FE','JR']));

ALTER TABLE public.permanence_lignes
  DROP CONSTRAINT IF EXISTS poste_perm_valide,
  ADD CONSTRAINT poste_perm_valide CHECK (poste = ANY (ARRAY['M','T','S','R','C','MAL','AT','FOR','HN','FE','JR']));

COMMIT;
