# Planning PWA — Marjane Tanger

Application de gestion des plannings hebdomadaires (React + Vite + TypeScript + Supabase), déployée sur GitHub Pages.

## Prérequis

- Node.js 20+
- Un projet Supabase (base Postgres + Auth + Edge Functions)

## Installation

```bash
npm install
cp .env.example .env
# renseigner VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY dans .env
npm run dev
```

## Structure

- `src/pages/` — un fichier par écran (Planning, Validation, Consolidation, Rapports, Administration…)
- `src/lib/dates.ts` — fonctions de dates centralisées
- `src/lib/postes.ts` — types et styles des codes de poste (M, T, S, R, C, HN, MAL, AT, FOR)
- `src/lib/anomalies.ts` — détection des anomalies métier (repos hebdo, double affectation, effectifs)
- `src/types/database.ts` — types générés depuis le schéma Supabase (`npm run types`)
- `supabase/schema.sql` — schéma SQL de référence (tables, policies RLS, fonctions), à régénérer après toute migration
- `supabase/functions/` — code des Edge Functions (`dynamic-worker` : création de compte, `delete-user` : suppression de compte)

## Rôles

- **administrateur** — accès complet, validation finale des plannings
- **chef_departement** — gère l'encadrement et valide les plannings rayon de son/ses département(s)
- **chef_rayon** — remplit le planning de son/ses rayon(s)

Les affectations (`rayon_ids`, `departement_ids`) sont des tableaux : un utilisateur peut couvrir plusieurs rayons ou départements.

## Circuit de validation

**Planning rayon** : brouillon → soumis_dept → soumis_admin → validé (ou rejeté à tout moment, avec motif, retour en brouillon).
**Planning encadrement** : brouillon → soumis → validé (même logique de rejet).

## Déploiement

Push sur `main` → GitHub Actions build et déploie automatiquement sur GitHub Pages.

## Base de données

Après toute modification du schéma (nouvelle table, colonne, policy) dans le dashboard Supabase, régénérer la documentation locale :

```bash
npx supabase login
npx supabase link --project-ref <ref-du-projet>
npx supabase db dump --schema public -f supabase/schema.sql
npm run types
```

## Edge Functions

Le déploiement en ligne de commande (`supabase functions deploy`) ne fonctionne pas depuis un environnement réseau restreint (ex. GitHub Codespaces) car il doit télécharger des dépendances externes. Déployer depuis le dashboard Supabase (Edge Functions → sélectionner la fonction → coller le code → Deploy).
