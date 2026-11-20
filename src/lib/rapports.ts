import { type Poste, POSTE_LABEL } from './postes';

/**
 * Logique pure de l'écran Rapports : types de données, filtre par période de travail et
 * statistiques pour les graphiques. Aucune dépendance React/Supabase → testable avec Vitest.
 *
 * « Période de travail » = poste de présence : M (Matin), T (Tranche), S (Soir) et HN (Horaire normal).
 * Ce sont exactement les postes de POSTES_TRAVAIL (lib/postes.ts).
 */

export const PERIODES = ['M', 'T', 'S', 'HN'] as const satisfies readonly Poste[];
export type Periode = (typeof PERIODES)[number];

export const PERIODE_LABEL: Record<Periode, string> = {
  M: POSTE_LABEL.M,
  T: POSTE_LABEL.T,
  S: POSTE_LABEL.S,
  HN: POSTE_LABEL.HN,
};

/** Couleurs des graphiques (alignées sur POSTE_STYLE : ambre / bleu / indigo / teal). */
export const PERIODE_COULEUR: Record<Periode, string> = {
  M: '#f59e0b',
  T: '#3b82f6',
  S: '#6366f1',
  HN: '#14b8a6',
};

export const estPeriode = (p: string): p is Periode => (PERIODES as readonly string[]).includes(p);

// ─── Types des données de rapport ────────────────────────────────────────────

export interface RayonLigne {
  rayonNom: string;
  depNom: string;
  collaborateurs: { nom: string; prenom: string; poste: Poste }[];
}

export interface SemaineLigne {
  rayonNom: string;
  depNom: string;
  /** `null` = case masquée par le filtre de période (jamais présent quand aucun filtre n'est actif). */
  collaborateurs: { nom: string; prenom: string; postes: (Poste | null)[] }[];
}

export interface MoisLigne {
  nom: string;
  prenom: string;
  rayonNom: string;
  depNom: string;
  travail: number;
  repos: number;
  conge: number;
  absences: number;
  total: number;
  /** Nombre de jours par période de travail sur le mois. */
  parPeriode: Record<Periode, number>;
}

export const periodesVides = (): Record<Periode, number> => ({ M: 0, T: 0, S: 0, HN: 0 });

// ─── Filtre par période ──────────────────────────────────────────────────────
// Convention : tableau vide = « Toutes les périodes » (valeur par défaut).

export const periodeActive = (periodes: readonly Periode[], p: string): boolean =>
  periodes.length === 0 || (periodes as readonly string[]).includes(p);

/** Ajoute/retire une période. Sélectionner les 4 revient à « Toutes » (tableau vide). */
export function basculerPeriode(courant: readonly Periode[], p: Periode): Periode[] {
  const suivant = courant.includes(p) ? courant.filter(x => x !== p) : [...courant, p];
  if (suivant.length === PERIODES.length) return [];
  return PERIODES.filter(x => suivant.includes(x));
}

export function libellePeriodes(periodes: readonly Periode[]): string {
  return periodes.length === 0 ? 'Toutes les périodes' : periodes.map(p => PERIODE_LABEL[p]).join(', ');
}

/** Mentions de filtres à afficher dans l'en-tête des exports (uniquement les filtres actifs). */
export function mentionsFiltres(periodes: readonly Periode[], departementNom?: string | null): string[] {
  const out: string[] = [];
  if (periodes.length > 0) out.push(`Période : ${libellePeriodes(periodes)}`);
  if (departementNom) out.push(`Département : ${departementNom}`);
  return out;
}

export function filtrerJournalier(data: RayonLigne[], periodes: readonly Periode[]): RayonLigne[] {
  if (periodes.length === 0) return data;
  return data
    .map(r => ({ ...r, collaborateurs: r.collaborateurs.filter(c => periodeActive(periodes, c.poste)) }))
    .filter(r => r.collaborateurs.length > 0);
}

/**
 * Hebdo : on masque les cases hors période et on retire les collaborateurs (puis les rayons)
 * sans aucun jour dans la sélection.
 */
export function filtrerHebdo(data: SemaineLigne[], periodes: readonly Periode[]): SemaineLigne[] {
  if (periodes.length === 0) return data;
  return data
    .map(r => ({
      ...r,
      collaborateurs: r.collaborateurs
        .map(c => ({ ...c, postes: c.postes.map(p => (p !== null && periodeActive(periodes, p) && estPeriode(p) ? p : null)) }))
        .filter(c => c.postes.some(p => p !== null)),
    }))
    .filter(r => r.collaborateurs.length > 0);
}

/**
 * Mensuel : `travail` devient le nombre de jours dans les périodes choisies, `parPeriode` est
 * remis à zéro pour les autres périodes, et les collaborateurs sans jour concerné sont retirés.
 */
export function filtrerMensuel(data: MoisLigne[], periodes: readonly Periode[]): MoisLigne[] {
  if (periodes.length === 0) return data;
  return data
    .map(c => {
      const parPeriode = periodesVides();
      for (const p of PERIODES) if (periodeActive(periodes, p)) parPeriode[p] = c.parPeriode[p];
      return { ...c, parPeriode, travail: PERIODES.reduce((a, p) => a + parPeriode[p], 0) };
    })
    .filter(c => c.travail > 0);
}

// ─── Statistiques pour les graphiques ────────────────────────────────────────

export interface StatsDepartement extends Record<Periode, number> {
  departement: string;
  total: number;
}

export interface StatsPeriodes {
  parDepartement: StatsDepartement[];
  global: Record<Periode, number>;
  total: number;
}

const SANS_DEPARTEMENT = 'Sans département';

function agreger(entrees: Iterable<{ dep: string; periode: Periode; n: number }>): StatsPeriodes {
  const deps = new Map<string, StatsDepartement>();
  const global = periodesVides();
  let total = 0;
  for (const { dep, periode, n } of entrees) {
    if (n <= 0) continue;
    const nom = dep || SANS_DEPARTEMENT;
    let d = deps.get(nom);
    if (!d) {
      d = { departement: nom, ...periodesVides(), total: 0 };
      deps.set(nom, d);
    }
    d[periode] += n;
    d.total += n;
    global[periode] += n;
    total += n;
  }
  const parDepartement = [...deps.values()].sort((a, b) => a.departement.localeCompare(b.departement, 'fr'));
  return { parDepartement, global, total };
}

/** Journalier : nombre de collaborateurs présents par période (une ligne = un collaborateur ce jour-là). */
export function statsJournalier(data: RayonLigne[]): StatsPeriodes {
  return agreger(
    data.flatMap(r => r.collaborateurs.flatMap(c => (estPeriode(c.poste) ? [{ dep: r.depNom, periode: c.poste, n: 1 }] : []))),
  );
}

/** Hebdo : nombre de jours-collaborateur par période sur la semaine. */
export function statsHebdo(data: SemaineLigne[]): StatsPeriodes {
  return agreger(
    data.flatMap(r =>
      r.collaborateurs.flatMap(c =>
        c.postes.flatMap(p => (p !== null && estPeriode(p) ? [{ dep: r.depNom, periode: p, n: 1 }] : [])),
      ),
    ),
  );
}

/** Mensuel : nombre de jours-collaborateur par période sur le mois. */
export function statsMensuel(data: MoisLigne[]): StatsPeriodes {
  return agreger(data.flatMap(c => PERIODES.map(p => ({ dep: c.depNom, periode: p, n: c.parPeriode[p] }))));
}
