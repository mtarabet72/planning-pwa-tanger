import { memo } from 'react';
import { POSTE_LABEL } from '../lib/postes';
import { NATURES, NATURE_COULEUR, formaterPourcentage, type StatsNatures } from '../lib/rapports';

interface Props {
  stats: StatsNatures;
  /** Ce que mesurent les chiffres, ex. « collaborateurs » (jour) ou « jours-collaborateur » (semaine / mois). */
  unite: string;
}

/**
 * Répartition de toutes les natures de poste (Matin, Tranche, Soir, Horaire normal, Repos, Congé, Maladie,
 * Accident de travail, Formation, Jour férié, Jour de récupération) : nombre et pourcentage de chacune.
 * Seules les natures présentes sont listées.
 */
function RapportNatures({ stats, unite }: Props) {
  if (stats.total === 0) return null;
  const lignes = NATURES.filter(n => stats.parNature[n] > 0);

  return (
    <section className="bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">Répartition par nature</h3>
        <span className="text-xs text-gray-400">{stats.total} {unite}</span>
      </div>

      <ul className="space-y-3">
        {lignes.map(n => {
          const valeur = stats.parNature[n];
          const pct = (valeur / stats.total) * 100;
          return (
            <li key={n}>
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: NATURE_COULEUR[n] }} />
                  <span className="truncate text-gray-700">{POSTE_LABEL[n]}</span>
                </span>
                <span className="shrink-0 tabular-nums">
                  <strong className="text-gray-800">{valeur}</strong>
                  <span className="text-gray-400"> · {formaterPourcentage(pct)} %</span>
                </span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: NATURE_COULEUR[n] }} />
              </div>
            </li>
          );
        })}
      </ul>

      <p className="text-xs text-gray-400 mt-3">
        Calculé sur les plannings enregistrés, avec le département et la date choisis ; le filtre de période ne l'affecte pas.
      </p>
    </section>
  );
}

export default memo(RapportNatures);
