/**
 * Lecture complète des tables Supabase.
 *
 * PostgREST tronque silencieusement chaque réponse à 1000 lignes (réglage « max rows » du projet,
 * 1000 par défaut) : sans pagination, un rapport sur un grand effectif serait incomplet sans aucune
 * erreur. Ces helpers lisent toutes les pages et découpent les gros `.in(...)` en lots (limite de
 * longueur d'URL). Aucune dépendance Supabase → testables avec Vitest.
 */

/** Doit rester ≤ au « max rows » du projet Supabase (1000 par défaut). */
export const TAILLE_PAGE = 1000;
/** Nombre maximal d'identifiants (UUID) passés dans un même `.in(...)`. */
export const TAILLE_LOT = 100;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export function decouper<T>(items: readonly T[], taille: number = TAILLE_LOT): T[][] {
  const lots: T[][] = [];
  for (let i = 0; i < items.length; i += taille) lots.push(items.slice(i, i + taille));
  return lots;
}

/**
 * Lit toutes les pages d'une requête. `requete(debut, fin)` doit appliquer `.range(debut, fin)` et
 * un `.order(...)` déterministe (ex. sur `id`) pour qu'aucune ligne ne soit sautée ou doublée.
 */
export async function lireToutesLesPages<T>(requete: (debut: number, fin: number) => Page<T>): Promise<T[]> {
  const out: T[] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await requete(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    out.push(...page);
    if (page.length < TAILLE_PAGE) return out;
  }
}

/** Comme `lireToutesLesPages`, pour un filtre `.in(...)` sur de nombreux identifiants (lots exécutés en parallèle). */
export async function lireParLots<T>(
  ids: readonly string[],
  requete: (lot: string[], debut: number, fin: number) => Page<T>,
): Promise<T[]> {
  const parLot = await Promise.all(decouper(ids).map(lot => lireToutesLesPages<T>((d, f) => requete(lot, d, f))));
  return parLot.flat();
}
