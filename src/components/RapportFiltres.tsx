import { memo } from 'react';
import { RotateCcw } from 'lucide-react';
import { PERIODES, PERIODE_LABEL, basculerPeriode, type Periode } from '../lib/rapports';

interface Props {
  /** Périodes sélectionnées ; tableau vide = « Toutes les périodes » (défaut). */
  periodes: Periode[];
  onChange: (periodes: Periode[]) => void;
  /** Réinitialise l'ensemble des filtres de l'écran (période, département, dates). */
  onReset: () => void;
  /** Désactive « Réinitialiser » quand tous les filtres sont déjà à leur valeur par défaut. */
  resetDisabled: boolean;
}

const chip = (actif: boolean) =>
  `px-3.5 py-2 rounded-xl text-sm font-medium border transition ${
    actif
      ? 'bg-blue-600 text-white border-blue-600'
      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'
  }`;

/** Filtre multi-sélection par période de travail (Matin / Tranche / Soir / Horaire normal). */
function RapportFiltres({ periodes, onChange, onReset, resetDisabled }: Props) {
  const toutes = periodes.length === 0;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrer par période de travail">
      <span className="text-xs font-medium text-gray-500 mr-1">Période</span>

      <button type="button" aria-pressed={toutes} onClick={() => onChange([])} className={chip(toutes)}>
        Toutes
      </button>
      {PERIODES.map(p => {
        const actif = periodes.includes(p);
        return (
          <button key={p} type="button" aria-pressed={actif} onClick={() => onChange(basculerPeriode(periodes, p))} className={chip(actif)}>
            {PERIODE_LABEL[p]}
          </button>
        );
      })}

      <button
        type="button"
        onClick={onReset}
        disabled={resetDisabled}
        className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium text-gray-600 border border-gray-200 bg-white hover:bg-gray-100 transition disabled:opacity-40 disabled:hover:bg-white disabled:cursor-not-allowed sm:ml-auto"
      >
        <RotateCcw className="w-4 h-4" /> Réinitialiser
      </button>
    </div>
  );
}

export default memo(RapportFiltres);
