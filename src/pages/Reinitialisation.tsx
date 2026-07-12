import { useState } from 'react';
import { AlertTriangle, Loader2, CheckCircle2, ShieldAlert, Trash2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

const MOT_CONFIRMATION = 'REINITIALISER';

type Etape = 'intro' | 'confirm1' | 'confirm2' | 'processing' | 'done' | 'error';

interface EtapeSuppression {
  label: string;
  status: 'attente' | 'en_cours' | 'ok' | 'erreur';
}

export default function Reinitialisation() {
  const [etape, setEtape] = useState<Etape>('intro');
  const [saisie, setSaisie] = useState('');
  const [checkbox2, setCheckbox2] = useState(false);
  const [progres, setProgres] = useState<EtapeSuppression[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);

  const saisieValide = saisie.trim().toUpperCase() === MOT_CONFIRMATION;

  function reset() {
    setEtape('intro');
    setSaisie('');
    setCheckbox2(false);
    setProgres([]);
    setErreur(null);
  }

  async function lancerReinitialisation() {
    setEtape('processing');
    setErreur(null);

    const steps: { label: string; run: () => Promise<void> }[] = [
      { label: 'Lignes de planning (rayons)', run: async () => { const { error } = await supabase.from('planning_lignes').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Plannings rayons', run: async () => { const { error } = await supabase.from('plannings').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Lignes de planning (encadrement)', run: async () => { const { error } = await supabase.from('planning_encadrement_lignes').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Plannings encadrement', run: async () => { const { error } = await supabase.from('plannings_encadrement').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Lignes de permanence & direction', run: async () => { const { error } = await supabase.from('permanence_lignes').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Membres de la permanence', run: async () => { const { error } = await supabase.from('permanence_membres').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Plannings de permanence & direction', run: async () => { const { error } = await supabase.from('plannings_permanence').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Collaborateurs', run: async () => { const { error } = await supabase.from('collaborateurs').delete().not('id', 'is', null); if (error) throw error; } },
      { label: 'Comptes utilisateurs (hors Administrateurs)', run: async () => { const { error } = await supabase.from('profiles').delete().neq('role', 'administrateur'); if (error) throw error; } },
    ];

    setProgres(steps.map(s => ({ label: s.label, status: 'attente' })));

    for (let i = 0; i < steps.length; i++) {
      setProgres(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'en_cours' } : p));
      try {
        await steps[i].run();
        setProgres(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'ok' } : p));
      } catch (e) {
        setProgres(prev => prev.map((p, idx) => idx === i ? { ...p, status: 'erreur' } : p));
        setErreur(e instanceof Error ? e.message : 'Erreur inconnue');
        setEtape('error');
        return;
      }
    }

    setEtape('done');
  }

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex gap-3">
        <ShieldAlert className="w-6 h-6 text-red-600 shrink-0 mt-0.5" />
        <div>
          <h3 className="font-semibold text-red-800">Réinitialisation de l'application</h3>
          <p className="text-sm text-red-700 mt-1">
            Cette action supprime définitivement les données d'exploitation pour repartir de zéro. Elle est irréversible.
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
        <div>
          <p className="text-xs font-semibold text-red-600 uppercase mb-1.5">Sera supprimé</p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Tous les comptes utilisateurs, sauf les comptes Administrateur</li>
            <li>Tous les collaborateurs</li>
            <li>Tous les plannings rayons, encadrement, permanence et direction (et leurs lignes)</li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold text-emerald-600 uppercase mb-1.5">Sera conservé</p>
          <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
            <li>Départements et Rayons (structure du magasin)</li>
            <li>Tous les comptes Administrateur</li>
            <li>Les horaires de permanence configurés (Matin / Tranche / Soir)</li>
          </ul>
        </div>
      </div>

      {etape === 'intro' && (
        <button
          onClick={() => setEtape('confirm1')}
          className="w-full flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-3 rounded-xl text-sm font-semibold hover:bg-red-700 transition"
        >
          <Trash2 className="w-4 h-4" /> Réinitialiser l'application
        </button>
      )}

      {etape === 'confirm1' && (
        <div className="bg-white rounded-2xl border border-red-200 p-5 space-y-4">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700">
              Première confirmation. Pour continuer, tape <span className="font-mono font-bold">{MOT_CONFIRMATION}</span> ci-dessous.
            </p>
          </div>
          <input
            type="text"
            value={saisie}
            onChange={e => setSaisie(e.target.value)}
            placeholder={MOT_CONFIRMATION}
            className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-mono tracking-wide focus:outline-none focus:ring-2 focus:ring-red-400"
            autoFocus
          />
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
              Annuler
            </button>
            <button
              onClick={() => setEtape('confirm2')}
              disabled={!saisieValide}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Continuer
            </button>
          </div>
        </div>
      )}

      {etape === 'confirm2' && (
        <div className="bg-white rounded-2xl border border-red-300 p-5 space-y-4">
          <div className="flex gap-2 items-start">
            <ShieldAlert className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-sm text-gray-800 font-medium">
              Deuxième et dernière confirmation. Cette action supprime définitivement les données listées ci-dessus et ne peut pas être annulée.
            </p>
          </div>
          <label className="flex items-start gap-2.5 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={checkbox2}
              onChange={e => setCheckbox2(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-red-600"
            />
            Je comprends que cette action est irréversible et je souhaite tout supprimer définitivement.
          </label>
          <div className="flex gap-2">
            <button onClick={reset} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
              Annuler
            </button>
            <button
              onClick={lancerReinitialisation}
              disabled={!checkbox2}
              className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Confirmer et tout supprimer
            </button>
          </div>
        </div>
      )}

      {(etape === 'processing' || etape === 'done' || etape === 'error') && (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
          {progres.map((p, i) => (
            <div key={i} className="flex items-center gap-2.5 text-sm">
              {p.status === 'attente' && <span className="w-4 h-4 rounded-full border-2 border-gray-200 shrink-0" />}
              {p.status === 'en_cours' && <Loader2 className="w-4 h-4 text-amber-500 animate-spin shrink-0" />}
              {p.status === 'ok' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {p.status === 'erreur' && <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />}
              <span className={p.status === 'attente' ? 'text-gray-400' : 'text-gray-700'}>{p.label}</span>
            </div>
          ))}

          {etape === 'done' && (
            <div className="pt-2 flex items-start gap-2.5 text-sm bg-emerald-50 text-emerald-700 rounded-xl px-3 py-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Réinitialisation terminée.</p>
                <p className="text-xs mt-0.5">L'application est prête pour une nouvelle saisie. Pense à recréer les comptes utilisateurs et collaborateurs.</p>
              </div>
            </div>
          )}

          {etape === 'error' && (
            <div className="pt-2 flex items-start gap-2.5 text-sm bg-red-50 text-red-700 rounded-xl px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">Une erreur est survenue, la réinitialisation s'est arrêtée.</p>
                {erreur && <p className="text-xs mt-0.5 font-mono">{erreur}</p>}
              </div>
            </div>
          )}

          {etape !== 'processing' && (
            <button onClick={reset} className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50">
              Fermer
            </button>
          )}
        </div>
      )}

      <p className="text-xs text-gray-400 leading-relaxed">
        Remarque : cela supprime les fiches (table <span className="font-mono">profiles</span>) des comptes non-Admin, mais pas leur
        accès de connexion Supabase Auth (nécessite une action côté Supabase avec la clé service_role). Pense à désactiver/supprimer
        ces comptes de connexion depuis le tableau de bord Supabase si besoin.
      </p>
    </div>
  );
}
