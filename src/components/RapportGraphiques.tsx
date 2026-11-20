import { memo, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  PERIODES, PERIODE_COULEUR, PERIODE_LABEL, periodeActive, type Periode, type StatsPeriodes,
} from '../lib/rapports';

interface Props {
  stats: StatsPeriodes;
  /** Périodes sélectionnées dans le filtre (vide = toutes) : seules ces séries sont affichées. */
  periodes: Periode[];
  /** Ce que mesurent les graphiques, ex. « collaborateurs » (jour) ou « jours-collaborateur » (semaine / mois). */
  unite: string;
}

const HAUTEUR_LIGNE = 44;

/**
 * Graphiques du rapport : barres par département (groupées ou empilées) + donut global.
 * Exporté en `memo` et chargé en lazy depuis la page : recharts n'est téléchargé qu'à l'ouverture
 * des stats, et le graphique ne se redessine que si `stats` / `periodes` changent réellement.
 */
function RapportGraphiques({ stats, periodes, unite }: Props) {
  const [empile, setEmpile] = useState(true);

  const visibles = useMemo(() => PERIODES.filter(p => periodeActive(periodes, p)), [periodes]);

  const donut = useMemo(
    () => visibles.map(p => ({ periode: p, name: PERIODE_LABEL[p], value: stats.global[p] })).filter(d => d.value > 0),
    [visibles, stats.global],
  );

  if (stats.total === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-400 text-sm">
        Aucune donnée à afficher pour les filtres sélectionnés.
      </div>
    );
  }

  const hauteurBarres = Math.max(220, stats.parDepartement.length * HAUTEUR_LIGNE + 70);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
      <section className="lg:col-span-3 bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <h3 className="text-sm font-semibold text-gray-800">Répartition par département</h3>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs" role="group" aria-label="Type de barres">
            {([[true, 'Empilé'], [false, 'Groupé']] as const).map(([val, label]) => (
              <button
                key={label}
                type="button"
                aria-pressed={empile === val}
                onClick={() => setEmpile(val)}
                className={`px-2.5 py-1 transition ${empile === val ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-100'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-gray-400 mb-2">Unité : {unite}</p>
        <div style={{ height: hauteurBarres }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.parDepartement} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="departement" width={96} tick={{ fontSize: 11 }} interval={0} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {visibles.map(p => (
                <Bar
                  key={p}
                  dataKey={p}
                  name={PERIODE_LABEL[p]}
                  fill={PERIODE_COULEUR[p]}
                  stackId={empile ? 'periodes' : undefined}
                  isAnimationActive={false}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 p-4 min-w-0">
        <h3 className="text-sm font-semibold text-gray-800">Total par période</h3>
        <p className="text-xs text-gray-400 mb-2">Unité : {unite}</p>
        <div className="relative" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={donut} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="85%" paddingAngle={2} isAnimationActive={false}>
                {donut.map(d => <Cell key={d.periode} fill={PERIODE_COULEUR[d.periode]} />)}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          {/* Total au centre du donut (le décalage compense la hauteur de la légende) */}
          <div className="absolute inset-x-0 top-0 bottom-8 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-2xl font-bold text-gray-800">{stats.total}</span>
            <span className="text-[11px] text-gray-400">au total</span>
          </div>
        </div>
      </section>
    </div>
  );
}

export default memo(RapportGraphiques);
