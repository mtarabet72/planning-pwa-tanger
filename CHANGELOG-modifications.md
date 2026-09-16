# Modifications appliquées (depuis l'analyse initiale)

## Sprint 1 — correctifs
1. PWA : manifest en double supprimé, icônes PNG (192/512/apple-touch), scope/start_url.
2. Mot de passe oublié : `recoveryMode` dans AuthContext + page `NouveauMotDePasse.tsx`.
3. Lignes fantômes : `lib/planningLignes.ts` (`purgerLignesOrphelines`) appelé avant chaque upsert
   (Planning, PlanningEncadrement, PlanningDirection ×2).
4. Bandeau « rayons sans planning » et badges corrigés.
5. `Sidebar` extraite dans `components/Sidebar.tsx` ; type `Tab` dans `types/index.ts`.
6. AuthContext : un seul listener `onAuthStateChange` (plus de double chargement).

## Fonctionnel
- Planning rayon : bouton « Copier S-1 ».
- Planning encadrement : badge de statut, « Soumettre à l'Admin », verrouillage après soumission/validation, « Reprendre ».
- Badges « Rejeté — à corriger » sur Planning et PlanningEncadrement.
- Notifications : section « Rejetés — à corriger » (avec motif), « Validés récemment » (7 jours, badge jusqu'à ouverture),
  badge rouge sur Encadrement ; rafraîchissement temps réel (Realtime) + toutes les 60 s + au retour sur l'app.

## Côté Supabase (déjà appliqué en SQL)
- Trigger `protect_profile_columns` (un utilisateur ne peut pas changer son rôle/affectations).
- Policies réécrites avec `rayon_ids` / `departement_ids` : plannings (select/update), plannings_encadrement
  (select/insert/update), planning_lignes, planning_encadrement_lignes, profiles (select), permanence_horaires.
- Fonction `current_departement_ids()`.
- À faire si pas encore fait : `alter publication supabase_realtime add table plannings, plannings_encadrement;`
