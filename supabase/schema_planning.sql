-- Documentation du schéma Planning
-- Ce fichier est informatif uniquement
-- Le schéma a déjà été exécuté dans Supabase SQL Editor

-- Table plannings :
-- id, rayon_id, semaine_debut (date lundi), statut, created_by, created_at

-- Table planning_lignes :
-- id, planning_id, collaborateur_id, jour (date), poste (M/AM/N/R/C)

-- Postes :
-- M  = Matin
-- AM = Après-midi
-- N  = Nuit
-- R  = Repos
-- C  = Congé
