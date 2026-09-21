/**
 * Règles métier de détection d'anomalies — module pur, sans accès réseau ni dépendance à
 * Supabase, pour rester directement testable avec des données synthétiques
 * (voir anomalies.test.ts). L'orchestration (récupération des données via Supabase) vit dans
 * lib/anomalies.ts, qui importe et appelle analyserAnomalies() depuis ce fichier.
 */

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
  /** Bloquante = violation dure des règles (double affectation, absence totale de repos).
   *  Avertissement = signal de qualité (répartition, cas particuliers), n'empêche pas la soumission sans confirmation. */
  gravite: 'bloquante' | 'avertissement';
  collaborateurId: string;
  collaborateurNom: string;
  message: string;
  detail?: string;
}

const GRAVITE_PAR_TYPE: Record<AnomalieType, 'bloquante' | 'avertissement'> = {
  double_affectation: 'bloquante',
  repos_hebdo: 'bloquante',
  trop_repos: 'avertissement',
  effectif1_hors_matin: 'avertissement',
  effectif2_couverture: 'avertissement',
  effectif3_repartition: 'avertissement',
};

export interface LigneBrute {
  collaborateur_id: string;
  jour: string; // YYYY-MM-DD
  poste: string;
  source: 'Planning Rayon' | 'Encadrement' | 'Permanence' | 'Direction';
  rayon_id?: string; // renseigné uniquement pour les lignes issues du planning Rayon
}
/**
 * Applique les règles métier (voir detecterAnomalies) à un jeu de lignes déjà récupéré.
 * Fonction pure — aucun accès réseau — ce qui la rend directement testable avec des données
 * synthétiques (voir anomalies.test.ts). `nomOf`/`nomRayon` sont injectables pour permettre aux
 * tests de se passer de Supabase ; par défaut ils renvoient l'identifiant tel quel.
 */
export function analyserAnomalies(
  lignes: LigneBrute[],
  jours: string[],
  nomOf: (id: string) => string = (id) => id,
  nomRayon: (id: string) => string = (id) => id,
): Anomalie[] {
  if (lignes.length === 0) return [];
  const semaineDebut = jours[0];
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
        gravite: GRAVITE_PAR_TYPE.double_affectation,
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
        gravite: GRAVITE_PAR_TYPE.repos_hebdo,
        collaborateurId: collabId,
        collaborateurNom: nomOf(collabId),
        message: `${nomOf(collabId)} n'a aucun jour de repos (R) sur la semaine du ${semaineDebut}.`,
      });
    } else if (nbRepos > MAX_REPOS_PAR_SEMAINE) {
      anomalies.push({
        id: `trop_repos_${collabId}_${semaineDebut}`,
        type: 'trop_repos',
        gravite: GRAVITE_PAR_TYPE.trop_repos,
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
            gravite: GRAVITE_PAR_TYPE.effectif1_hors_matin,
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
            gravite: GRAVITE_PAR_TYPE.effectif2_couverture,
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
            gravite: GRAVITE_PAR_TYPE.effectif3_repartition,
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
