import { supabase } from './supabase';
import type { Profile } from '../types';

// Codes poste considérés comme "travail effectif" (occupent le collaborateur ce jour-là).
// R = Repos, C = Congé, MAL = Maladie, AT = Accident Travail ne sont PAS des postes de travail.
const POSTES_TRAVAIL = new Set(['M', 'T', 'S', 'HN', 'FOR']);
const POSTE_REPOS = 'R';

export type AnomalieType = 'double_affectation' | 'repos_hebdo';

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
async function fetchLignesSemaine(profile: Profile, semaineDebut: string): Promise<LigneBrute[]> {
  const lignes: LigneBrute[] = [];
  const isAdmin = profile.role === 'administrateur';
  const isChefDept = profile.role === 'chef_departement';
  const isChefRayon = profile.role === 'chef_rayon';

  // Détermine la liste des rayon_id à couvrir pour le planning "Rayon"
  let rayonIdsScope: string[] | null = null; // null = pas de restriction (admin)
  if (isChefRayon) {
    rayonIdsScope = profile.rayon_ids ?? [];
  } else if (isChefDept) {
    const { data: rayonsDep } = await supabase
      .from('rayons').select('id').in('departement_id', profile.departement_ids ?? []);
    rayonIdsScope = (rayonsDep ?? []).map((r: any) => r.id);
  }

  // 1. Plannings rayon (visible par admin, chef_departement sur ses rayons, chef_rayon sur les siens)
  if (isAdmin || isChefDept || isChefRayon) {
    let q = supabase.from('plannings').select('id').eq('semaine_debut', semaineDebut);
    if (rayonIdsScope !== null) {
      if (rayonIdsScope.length === 0) rayonIdsScope = ['__aucun__']; // évite un .in() vide (qui matcherait tout)
      q = q.in('rayon_id', rayonIdsScope);
    }
    const { data: plannings } = await q;
    const ids = (plannings ?? []).map((p: any) => p.id);
    if (ids.length > 0) {
      const { data } = await supabase
        .from('planning_lignes').select('collaborateur_id, jour, poste').in('planning_id', ids);
      (data ?? []).forEach((l: any) => lignes.push({ ...l, source: 'Planning Rayon' }));
    }
  }

  // 2. Plannings encadrement (visible par admin et chef_departement, sur son propre département)
  if (isAdmin || isChefDept) {
    let q = supabase.from('plannings_encadrement').select('id').eq('semaine_debut', semaineDebut);
    if (isChefDept) q = q.in('departement_id', profile.departement_ids ?? []);
    const { data: plannings } = await q;
    const ids = (plannings ?? []).map((p: any) => p.id);
    if (ids.length > 0) {
      const { data } = await supabase
        .from('planning_encadrement_lignes').select('collaborateur_id, jour, poste').in('planning_id', ids);
      (data ?? []).forEach((l: any) => lignes.push({ ...l, source: 'Encadrement' }));
    }
  }

  // 3. Permanence + Direction (réservé aux administrateurs)
  if (isAdmin) {
    const { data: plannings } = await supabase
      .from('plannings_permanence').select('id, type').eq('semaine_debut', semaineDebut);
    for (const p of plannings ?? []) {
      const { data } = await supabase
        .from('permanence_lignes').select('collaborateur_id, jour, poste').eq('planning_id', (p as any).id);
      const source = (p as any).type === 'direction' ? 'Direction' : 'Permanence';
      (data ?? []).forEach((l: any) => lignes.push({ ...l, source }));
    }
  }

  return lignes;
}

/**
 * Détecte les anomalies de règles métier visibles par `profile`, pour la semaine contenant `date` :
 * - Double affectation : un collaborateur avec un poste de travail sur 2 plannings différents le même jour
 *   (ne se déclenche que si le rôle a accès à plusieurs sources à la fois, ex: administrateur).
 * - Repos hebdomadaire : un collaborateur sans aucun jour "R" sur sa semaine (planning rayon, dans le périmètre du rôle).
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
  const nomOf = (id: string) => {
    const c = (collabs ?? []).find((c: any) => c.id === id);
    return c ? `${(c as any).nom} ${(c as any).prenom}` : id;
  };

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
    // On exige que les 7 jours de la semaine soient renseignés pour juger valablement de l'absence de repos
    const joursRenseignes = new Set(joursCollab.map(l => l.jour));
    const semaineComplete = jours.every(j => joursRenseignes.has(j));
    if (!semaineComplete) continue;
    const aUnRepos = joursCollab.some(l => l.poste === POSTE_REPOS);
    if (!aUnRepos) {
      anomalies.push({
        id: `repos_${collabId}_${semaineDebut}`,
        type: 'repos_hebdo',
        collaborateurId: collabId,
        collaborateurNom: nomOf(collabId),
        message: `${nomOf(collabId)} n'a aucun jour de repos (R) sur la semaine du ${semaineDebut}.`,
      });
    }
  }

  return anomalies;
}
