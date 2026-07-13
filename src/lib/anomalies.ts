import { supabase } from './supabase';
import type { Profile } from '../types';

// Codes poste considérés comme "travail effectif" (occupent le collaborateur ce jour-là).
// R = Repos, C = Congé, MAL = Maladie, AT = Accident Travail ne sont PAS des postes de travail.
const POSTES_TRAVAIL = new Set(['M', 'T', 'S', 'HN', 'FOR']);
const POSTE_REPOS = 'R';
const MAX_REPOS_PAR_SEMAINE = 1; // au-delà, anomalie "trop de repos"
const POSTE_MATIN = 'M';
const POSTES_SOIR_TRANCHE = new Set(['S', 'T']);

export type AnomalieType =
  | 'double_affectation'
  | 'repos_hebdo'
  | 'trop_repos'
  | 'effectif1_hors_matin'
  | 'effectif2_couverture'
  | 'effectif3_repartition';

export interface Anomalie {
  id: string;
  type: AnomalieType;
  collaborateurId: string;
  collaborateurNom: string;
  message: string;
  detail?: string;
}

interface LigneBrute {
  collaborateur_id: string;
  jour: string; // YYYY-MM-DD
  poste: string;
  source: 'Planning Rayon' | 'Encadrement' | 'Permanence' | 'Direction';
  rayon_id?: string; // renseigné uniquement pour les lignes issues du planning Rayon
}

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

/**
 * Récupère les lignes de planning visibles par le profil connecté, pour une semaine donnée.
 * Le périmètre est adapté au rôle plutôt que de tenter d'interroger des tables/lignes
 * bloquées par les policies RLS (ce qui reviendrait simplement à 0 résultat, silencieusement) :
 * - administrateur : les 3 sources (Rayon, Encadrement, Permanence, Direction), tout le magasin.
 * - chef_departement : les rayons de son/ses département(s) + son propre planning encadrement.
 * - chef_rayon : uniquement son/ses rayon(s).
 */
/** Enveloppe .in() en évitant un tableau vide (qui peut être mal interprété selon la version de PostgREST). */
function safeIn<T>(builder: any, column: string, values: T[]) {
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
        rayonIdsScope = (rayonsDep ?? []).map((r: any) => r.id);
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
      const ids = (plannings ?? []).map((p: any) => p.id);
      const rayonIdParPlanning = new Map<string, string>(
        (plannings ?? []).map((p: any) => [p.id, p.rayon_id])
      );
      if (ids.length > 0) {
        const { data, error: errLignes } = await supabase
          .from('planning_lignes').select('planning_id, collaborateur_id, jour, poste').in('planning_id', ids);
        if (errLignes) throw errLignes;
        (data ?? []).forEach((l: any) => lignes.push({
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
      const ids = (plannings ?? []).map((p: any) => p.id);
      if (ids.length > 0) {
        const { data, error: errLignes } = await supabase
          .from('planning_encadrement_lignes').select('collaborateur_id, jour, poste').in('planning_id', ids);
        if (errLignes) throw errLignes;
        (data ?? []).forEach((l: any) => lignes.push({ ...l, source: 'Encadrement' }));
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
          .from('permanence_lignes').select('collaborateur_id, jour, poste').eq('planning_id', (p as any).id);
        if (errLignes) throw errLignes;
        const source = (p as any).type === 'direction' ? 'Direction' : 'Permanence';
        (data ?? []).forEach((l: any) => lignes.push({ ...l, source }));
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
 * - Cohérence effectif/postes par rayon (voir Règle 3 ci-dessous).
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
    (collabs ?? []).map((c: any) => [c.id, `${c.nom} ${c.prenom}`])
  );
  const nomOf = (id: string) => nomsParId.get(id) ?? id;

  const anomalies: Anomalie[] = [];

  // --- Règle 1 : double affectation (même collaborateur, même jour, poste de travail dans 2 sources)
  const parCollabJour = new Map<string, LigneBrute[]>();
  for (const l of lignes) {
    if (!POSTES_TRAVAIL.has(l.poste)) continue;
    const key = `${l.collaborateur_id}|${l.jour}`;
    if (!parCollabJour.has(key)) parCollabJour.set(key, []);
    parCollabJour.get(key)!.push(l);
  }
  for (const [key, group] of parCollabJour.entries()) {
    const sourcesDistinctes = new Set(group.map(g => g.source));
    if (sourcesDistinctes.size > 1) {
      const [collabId, jour] = key.split('|');
      anomalies.push({
        id: `double_${key}`,
        type: 'double_affectation',
        collaborateurId: collabId,
        collaborateurNom: nomOf(collabId),
        message: `${nomOf(collabId)} est affecté(e) le ${jour} dans plusieurs plannings à la fois (${Array.from(sourcesDistinctes).join(' + ')}).`,
      });
    }
  }

  // --- Règle 2 : repos hebdomadaire (au moins 1 jour "R" par semaine, planning rayon uniquement)
  const lignesRayon = lignes.filter(l => l.source === 'Planning Rayon');
  const collabsRayon = Array.from(new Set(lignesRayon.map(l => l.collaborateur_id)));
  for (const collabId of collabsRayon) {
    const joursCollab = lignesRayon.filter(l => l.collaborateur_id === collabId);
    // On exige que les 7 jours de la semaine soient renseignés pour juger valablement de l'absence/excès de repos
    const joursRenseignes = new Set(joursCollab.map(l => l.jour));
    const semaineComplete = jours.every(j => joursRenseignes.has(j));
    if (!semaineComplete) continue;

    const nbRepos = joursCollab.filter(l => l.poste === POSTE_REPOS).length;

    if (nbRepos === 0) {
      anomalies.push({
        id: `repos_${collabId}_${semaineDebut}`,
        type: 'repos_hebdo',
        collaborateurId: collabId,
        collaborateurNom: nomOf(collabId),
        message: `${nomOf(collabId)} n'a aucun jour de repos (R) sur la semaine du ${semaineDebut}.`,
      });
    } else if (nbRepos > MAX_REPOS_PAR_SEMAINE) {
      anomalies.push({
        id: `trop_repos_${collabId}_${semaineDebut}`,
        type: 'trop_repos',
        collaborateurId: collabId,
        collaborateurNom: nomOf(collabId),
        message: `${nomOf(collabId)} a ${nbRepos} jours de repos (R) sur la semaine du ${semaineDebut} — au-delà du maximum de ${MAX_REPOS_PAR_SEMAINE}.`,
      });
    }
  }

  // --- Règle 3 : cohérence effectif / répartition des postes, par rayon (planning rayon uniquement)
  // Effectif = nombre de collaborateurs distincts ayant au moins une ligne dans le planning de la semaine, pour ce rayon.
  //   - effectif 1 : tous les jours travaillés doivent être en poste "M" (Matin).
  //   - effectif 2 : chaque jour où les 2 sont présents, la combinaison doit être M+S ou M+T (jamais 2x le même poste).
  //   - effectif 3+ : répartition stricte des postes M et S/T entre les employés du rayon (écart max 1 jour).
  const parRayon = new Map<string, LigneBrute[]>();
  for (const l of lignesRayon) {
    if (!l.rayon_id) continue;
    if (!parRayon.has(l.rayon_id)) parRayon.set(l.rayon_id, []);
    parRayon.get(l.rayon_id)!.push(l);
  }

  const rayonIdsConcernes = Array.from(parRayon.keys());
  const { data: rayonsData } = await supabase
    .from('rayons').select('id, nom').in('id', rayonIdsConcernes.length > 0 ? rayonIdsConcernes : ['__aucun__']);
  const nomRayonMap = new Map<string, string>((rayonsData ?? []).map((r: any) => [r.id, r.nom]));
  const nomRayon = (id: string) => nomRayonMap.get(id) ?? id;

  for (const [rayonId, lignesDuRayon] of parRayon.entries()) {
    const collabsDuRayon = Array.from(new Set(lignesDuRayon.map(l => l.collaborateur_id)));
    const effectif = collabsDuRayon.length;
    const nomR = nomRayon(rayonId);

    if (effectif === 1) {
      const collabId = collabsDuRayon[0];
      const joursCollab = lignesDuRayon.filter(l => l.collaborateur_id === collabId);
      for (const l of joursCollab) {
        if (POSTES_TRAVAIL.has(l.poste) && l.poste !== POSTE_MATIN) {
          anomalies.push({
            id: `effectif1_${collabId}_${l.jour}`,
            type: 'effectif1_hors_matin',
            collaborateurId: collabId,
            collaborateurNom: nomOf(collabId),
            message: `${nomOf(collabId)} (rayon ${nomR}, effectif 1) est en poste "${l.poste}" le ${l.jour} — un rayon à 1 seul employé doit être planifié en Matin (M), avec 1 jour de repos hebdomadaire.`,
          });
        }
      }
    } else if (effectif === 2) {
      const parJour = new Map<string, LigneBrute[]>();
      for (const l of lignesDuRayon) {
        if (!POSTES_TRAVAIL.has(l.poste)) continue;
        if (!parJour.has(l.jour)) parJour.set(l.jour, []);
        parJour.get(l.jour)!.push(l);
      }
      for (const [jour, group] of parJour.entries()) {
        if (group.length < 2) continue; // un seul des deux présent ce jour-là (probablement l'autre en repos) : rien à vérifier
        const postes = group.map(g => g.poste).sort();
        const comboValide = postes.length === 2 && postes[0] === POSTE_MATIN && POSTES_SOIR_TRANCHE.has(postes[1]);
        if (!comboValide) {
          const noms = group.map(g => nomOf(g.collaborateur_id)).join(' & ');
          anomalies.push({
            id: `effectif2_${rayonId}_${jour}`,
            type: 'effectif2_couverture',
            collaborateurId: group[0].collaborateur_id,
            collaborateurNom: noms,
            message: `Rayon ${nomR} (effectif 2) le ${jour} : combinaison de postes "${postes.join('+')}" invalide — attendu M+S ou M+T (un Matin et un Soir/Tranche), jamais le même poste pour les deux.`,
          });
        }
      }
    } else if (effectif >= 3) {
      // On exige la semaine complète (7 jours renseignés) pour chaque collaborateur du rayon, sinon comparaison faussée.
      const semaineComplete = collabsDuRayon.every(cId => {
        const jrs = new Set(lignesDuRayon.filter(l => l.collaborateur_id === cId).map(l => l.jour));
        return jours.every(j => jrs.has(j));
      });
      if (!semaineComplete) continue;

      const compterParType = (predicat: (poste: string) => boolean) => {
        const counts = new Map<string, number>();
        for (const cId of collabsDuRayon) {
          const n = lignesDuRayon.filter(l => l.collaborateur_id === cId && predicat(l.poste)).length;
          counts.set(cId, n);
        }
        return counts;
      };

      const typesAVerifier: Array<{ code: 'M' | 'S/T'; predicat: (poste: string) => boolean }> = [
        { code: 'M', predicat: p => p === POSTE_MATIN },
        { code: 'S/T', predicat: p => POSTES_SOIR_TRANCHE.has(p) },
      ];

      for (const { code, predicat } of typesAVerifier) {
        const counts = compterParType(predicat);
        const valeurs = Array.from(counts.values());
        const max = Math.max(...valeurs);
        const min = Math.min(...valeurs);
        if (max - min > 1) {
          const detail = collabsDuRayon.map(cId => `${nomOf(cId)}: ${counts.get(cId)}`).join(', ');
          anomalies.push({
            id: `effectif3_${rayonId}_${code.replace('/', '')}`,
            type: 'effectif3_repartition',
            collaborateurId: collabsDuRayon[0],
            collaborateurNom: nomR,
            message: `Rayon ${nomR} (effectif ${effectif}) : répartition des postes "${code === 'M' ? 'Matin' : 'Soir/Tranche'}" déséquilibrée entre employés (écart de ${max - min} jours) — ${detail}.`,
            detail,
          });
        }
      }
    }
  }

  return anomalies;
}
