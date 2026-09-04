import { supabase } from './supabase';

type TableLignes = 'planning_lignes' | 'planning_encadrement_lignes' | 'permanence_lignes';

/**
 * Supprime, pour un planning donné, les lignes des collaborateurs qui ne figurent plus dans la grille
 * (collaborateur désactivé, transféré de rayon, retiré de la permanence…).
 * Sans cela, l'upsert laisse des lignes fantômes qui faussent rapports et consolidation.
 */
export async function purgerLignesOrphelines(table: TableLignes, planningId: string, collaborateurIdsConserves: string[]) {
  let q = supabase.from(table).delete().eq('planning_id', planningId);
  if (collaborateurIdsConserves.length > 0) {
    q = q.not('collaborateur_id', 'in', `(${collaborateurIdsConserves.join(',')})`);
  }
  const { error } = await q;
  if (error) throw error;
}
