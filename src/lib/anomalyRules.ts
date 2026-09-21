import { supabase } from './supabase';
import { getLundi as startOfWeek, addDays, formatDate } from './dates';
import type { Profile } from '../types';
import { analyserAnomalies, type Anomalie, type AnomalieType, type LigneBrute } from './anomalyRules';

export type { Anomalie, AnomalieType, LigneBrute };
export { analyserAnomalies };

/**
 * Récupère les lignes de planning visibles par le profil connecté, pour une semaine donnée.
 * Le périmètre est adapté au rôle plutôt que de tenter d'interroger des tables/lignes
 * bloquées par les policies RLS (ce qui reviendrait simplement à 0 résultat, silencieusement) :
 * - administrateur : les 3 sources (Rayon, Encadrement, Permanence, Direction), tout le magasin.
 * - chef_departement : les rayons de son/ses département(s) + son propre planning encadrement.
 * - chef_rayon : uniquement son/ses rayon(s).
 */
/** Enveloppe .in() en évitant un tableau vide (qui peut être mal interprété selon la version de PostgREST). */
function safeIn<B extends { eq(column: string, value: unknown): B; in(column: string, values: readonly unknown[]): B }>(
  builder: B, column: string, values: unknown[]
): B {
  if (values.length === 0) return builder.eq(column, '__aucun__'); // ne matchera jamais rien
  return builder.in(column, values);
}

async function fetchLignesSemaine(profile: Profile, semaineDebut: string): Promise<LigneBrute[]> {
  const lignes: LigneBrute[] = [];
  const isAdmin = profile.role === 'administrateur';
  const isChefDept = profile.role === 'chef_departement';
  const isChefRayon = profile.role === 'chef_rayon';
  const departementIds = profile.departement_ids ?? [];

  // Détermine la liste des rayon_id à couvrir pour le planning "Rayon"
  let rayonIdsScope: string[] | null = null; // null = pas de restriction (admin)
  try {
    if (isChefRayon) {
      rayonIdsScope = profile.rayon_ids ?? [];
    } else if (isChefDept) {
      if (departementIds.length === 0) {
        rayonIdsScope = [];
      } else {
        const { data: rayonsDep, error } = await safeIn(supabase.from('rayons').select('id'), 'departement_id', departementIds);
        if (error) throw error;
        rayonIdsScope = (rayonsDep ?? []).map((r) => r.id);
      }
    }
  } catch (err) {
    console.error('[assistant] Erreur résolution des rayons du département :', err);
    rayonIdsScope = []; // on continue avec un périmètre vide plutôt que de tout faire échouer
  }

  // 1. Plannings rayon (visible par admin, chef_departement sur ses rayons, chef_rayon sur les siens)
  if (isAdmin || isChefDept || isChefRayon) {
    try {
      let q = supabase.from('plannings').select('id, rayon_id').eq('semaine_debut', semaineDebut);
      if (rayonIdsScope !== null) q = safeIn(q, 'rayon_id', rayonIdsScope);
      const { data: plannings, error } = await q;
      if (error) throw error;
      const ids = (plannings ?? []).map((p) => p.id);
      const rayonIdParPlanning = new Map<string, string>(
        (plannings ?? []).map((p) => [p.id, p.rayon_id])
      );
      if (ids.length > 0) {
        const { data, error: errLignes } = await supabase
          .from('planning_lignes').select('planning_id, collaborateur_id, jour, poste').in('planning_id', ids);
        if (errLignes) throw errLignes;
        (data ?? []).forEach((l) => lignes.push({
          collaborateur_id: l.collaborateur_id,
          jour: l.jour,
          poste: l.poste,
          source: 'Planning Rayon',
          rayon_id: rayonIdParPlanning.get(l.planning_id),
        }));
      }
    } catch (err) {
      console.error('[assistant] Erreur lecture planning rayon :', err);
    }
  }

  // 2. Plannings encadrement (visible par admin et chef_departement, sur son propre département)
  if (isAdmin || (isChefDept && departementIds.length > 0)) {
    try {
      let q = supabase.from('plannings_encadrement').select('id').eq('semaine_debut', semaineDebut);
      if (isChefDept) q = safeIn(q, 'departement_id', departementIds);
      const { data: plannings, error } = await q;
      if (error) throw error;
      const ids = (plannings ?? []).map((p) => p.id);
      if (ids.length > 0) {
        const { data, error: errLignes } = await supabase
          .from('planning_encadrement_lignes').select('collaborateur_id, jour, poste').in('planning_id', ids);
        if (errLignes) throw errLignes;
        (data ?? []).forEach((l) => lignes.push({ ...l, source: 'Encadrement' }));
      }
    } catch (err) {
      console.error('[assistant] Erreur lecture planning encadrement :', err);
    }
  }

  // 3. Permanence + Direction (réservé aux administrateurs)
  if (isAdmin) {
    try {
      const { data: plannings, error } = await supabase
        .from('plannings_permanence').select('id, type').eq('semaine_debut', semaineDebut);
      if (error) throw error;
      for (const p of plannings ?? []) {
        const { data, error: errLignes } = await supabase
          .from('permanence_lignes').select('collaborateur_id, jour, poste').eq('planning_id', p.id);
        if (errLignes) throw errLignes;
        const source = p.type === 'direction' ? 'Direction' : 'Permanence';
        (data ?? []).forEach((l) => lignes.push({ ...l, source }));
      }
    } catch (err) {
      console.error('[assistant] Erreur lecture permanence/direction :', err);
    }
  }

  return lignes;
}

/**
 * Détecte les anomalies de règles métier visibles par `profile`, pour la semaine contenant `date` :
 * - Double affectation : un collaborateur avec un poste de travail sur 2 plannings différents le même jour
 *   (ne se déclenche que si le rôle a accès à plusieurs sources à la fois, ex: administrateur).
 * - Repos hebdomadaire : un collaborateur sans aucun jour "R" sur sa semaine (planning rayon, dans le périmètre du rôle).
 * - Cohérence effectif/postes par rayon (voir Règle 3 dans analyserAnomalies).
 *
 * Se charge uniquement de récupérer les données (lignes + noms) puis délègue l'évaluation des
 * règles à analyserAnomalies, qui elle est pure et testable indépendamment de Supabase.
 */
export async function detecterAnomalies(profile: Profile, date: Date = new Date()): Promise<Anomalie[]> {
  const semaine = startOfWeek(date);
  const semaineDebut = formatDate(semaine);
  const jours = Array.from({ length: 7 }, (_, i) => formatDate(addDays(semaine, i)));

  const lignes = await fetchLignesSemaine(profile, semaineDebut);
  if (lignes.length === 0) return [];

  const collabIds = Array.from(new Set(lignes.map(l => l.collaborateur_id)));
  const { data: collabs } = await supabase
    .from('collaborateurs').select('id, nom, prenom').in('id', collabIds);
  const nomsParId = new Map<string, string>(
    (collabs ?? []).map((c) => [c.id, `${c.nom} ${c.prenom}`])
  );
  const nomOf = (id: string) => nomsParId.get(id) ?? id;

  const rayonIds = Array.from(new Set(
    lignes.filter(l => l.source === 'Planning Rayon' && l.rayon_id).map(l => l.rayon_id!)
  ));
  const { data: rayonsData } = await supabase
    .from('rayons').select('id, nom').in('id', rayonIds.length > 0 ? rayonIds : ['__aucun__']);
  const nomRayonMap = new Map<string, string>((rayonsData ?? []).map((r) => [r.id, r.nom]));
  const nomRayon = (id: string) => nomRayonMap.get(id) ?? id;

  return analyserAnomalies(lignes, jours, nomOf, nomRayon);
}