/** Codes de poste utilisés dans tous les plannings (rayon, encadrement, permanence, direction). */
export type Poste = 'M' | 'T' | 'S' | 'R' | 'C' | 'HN' | 'MAL' | 'AT' | 'FOR';

/** Cycle rapide (clic simple sur une case du planning). */
export const POSTES_CYCLE: Poste[] = ['M', 'T', 'S', 'R', 'C'];
/** Codes spéciaux, accessibles via appui long / menu complet. */
export const POSTES_SPECIAUX: Poste[] = ['HN', 'MAL', 'AT', 'FOR'];
/** Tous les codes, pour le menu de sélection complet. */
export const POSTES_TOUS: Poste[] = ['M', 'T', 'S', 'R', 'C', 'HN', 'MAL', 'AT', 'FOR'];

export const POSTE_LABEL: Record<Poste, string> = {
  M: 'Matin', T: 'Tranche', S: 'Soir', R: 'Repos', C: 'Congé',
  HN: 'Horaire Normal', MAL: 'Maladie', AT: 'Accident Travail', FOR: 'Formation',
};

/** Style avec bordure — utilisé sur les grilles éditables (cases cliquables). */
export const POSTE_STYLE: Record<Poste, string> = {
  M:   'bg-amber-100 text-amber-800 border-amber-300',
  T:   'bg-blue-100 text-blue-800 border-blue-300',
  S:   'bg-indigo-100 text-indigo-800 border-indigo-300',
  R:   'bg-gray-100 text-gray-500 border-gray-300',
  C:   'bg-emerald-100 text-emerald-800 border-emerald-300',
  HN:  'bg-teal-100 text-teal-800 border-teal-300',
  MAL: 'bg-rose-100 text-rose-800 border-rose-300',
  AT:  'bg-red-100 text-red-800 border-red-300',
  FOR: 'bg-violet-100 text-violet-800 border-violet-300',
};

/** Style sans bordure — utilisé sur les affichages en lecture seule (Historique, Rapports). */
export const POSTE_STYLE_FLAT: Record<Poste, string> = {
  M:   'bg-amber-100 text-amber-800',
  T:   'bg-blue-100 text-blue-800',
  S:   'bg-indigo-100 text-indigo-800',
  R:   'bg-gray-100 text-gray-500',
  C:   'bg-emerald-100 text-emerald-800',
  HN:  'bg-teal-100 text-teal-800',
  MAL: 'bg-rose-100 text-rose-800',
  AT:  'bg-red-100 text-red-800',
  FOR: 'bg-violet-100 text-violet-800',
};

/** Couleurs de remplissage RGB pour les exports PDF (jsPDF). */
export const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M:   [254, 243, 199],
  T:   [219, 234, 254],
  S:   [224, 231, 255],
  R:   [243, 244, 246],
  C:   [209, 250, 229],
  HN:  [204, 251, 241],
  MAL: [255, 228, 230],
  AT:  [254, 226, 226],
  FOR: [237, 233, 254],
};

// Catégorisation utilisée pour les compteurs (rapports, consolidation, exports Excel).
// Note : cette catégorisation diffère intentionnellement de celle de lib/anomalies.ts, qui
// traite FOR (formation) comme un poste de travail effectif pour la détection d'anomalies —
// les deux usages ont des besoins différents et ne doivent pas être unifiés sans décision métier.
export const POSTES_TRAVAIL: readonly Poste[] = ['M', 'T', 'S', 'HN'];
export const POSTES_REPOS: readonly Poste[] = ['R', 'C'];
export const POSTES_ABSENCE: readonly Poste[] = ['MAL', 'AT', 'FOR'];

export const estTravail = (p: string): boolean => (POSTES_TRAVAIL as readonly string[]).includes(p);
export const estRepos = (p: string): boolean => (POSTES_REPOS as readonly string[]).includes(p);
export const estAbsence = (p: string): boolean => (POSTES_ABSENCE as readonly string[]).includes(p);