import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, Send, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';

type Statut = 'brouillon' | 'soumis' | 'valide' | 'rejete';

const STATUT_STYLE: Record<Statut, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  soumis:    'bg-amber-100 text-amber-700',
  valide:    'bg-emerald-100 text-emerald-700',
  rejete:    'bg-red-100 text-red-700',
};

const STATUT_LABEL: Record<Statut, string> = {
  brouillon: 'Brouillon',
  soumis:    'Soumis',
  valide:    'Validé',
  rejete:    'Rejeté',
};

const STATUT_ICON: Record<Statut, React.ElementType> = {
  brouillon: Clock,
  soumis:    Send,
  valide:    CheckCircle,
  rejete:    XCircle,
};

interface PlanningItem {
  id: string;
  rayon_id: string;
  semaine_debut: string;
  statut: Statut;
  commentaire: string | null;
  rayonNom: string;
  depNom: string;
  nb_lignes: number;
}

function getLundi(date: Date): Date {
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

function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDisplay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export default function Validation() {
  const { profile } = useAuth();
  const isAdmin = canAccessAdmin(profile?.role ?? 'chef_rayon');
  const isChefDep = profile?.role === 'chef_departement';
  const isChefRayon = profile?.role === 'chef_rayon';

  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [plannings, setPlannings] = useState<PlanningItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [commentaire, setCommentaire] = useState('');
  const [showRejet, setShowRejet] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const semaineLabel = `${formatDisplay(semaine)} – ${formatDisplay(addDays(semaine, 6))}`;

  useEffect(() => { loadPlannings(); }, [semaine]);

  async function loadPlannings() {
    setLoading(true);
    const debut = formatDate(semaine);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('plannings')
      .select('id, rayon_id, semaine_debut, statut, commentaire, rayons(nom, departements(nom))')
      .eq('semaine_debut', debut)
      .order('statut');

    if (isChefRayon && profile?.rayon_id) {
      query = query.eq('rayon_id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      query = query.in('rayon_id',
        (await supabase.from('rayons').select('id').eq('departement_id', profile.departement_id)).data?.map((r: { id: string }) => r.id) ?? []
      );
    }

    const { data } = await query;

    const items: PlanningItem[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map(async (p: any) => {
        const { count } = await supabase
          .from('planning_lignes')
          .select('id', { count: 'exact' })
          .eq('planning_id', p.id);
        return {
          id: p.id,
          rayon_id: p.rayon_id,
          semaine_debut: p.semaine_debut,
          statut: p.statut as Statut,
          commentaire: p.commentaire,
          rayonNom: p.rayons?.nom ?? '—',
          depNom: p.rayons?.departements?.nom ?? '—',
          nb_lignes: count ?? 0,
        };
      })
    );

    setPlannings(items);
    setLoading(false);
  }

  async function handleSoumettre(id: string) {
    setProcessing(true);
    await supabase.from('plannings').update({ statut: 'soumis', commentaire: null }).eq('id', id);
    await loadPlannings();
    setProcessing(false);
  }

  async function handleValider(id: string) {
    setProcessing(true);
    await supabase.from('plannings').update({
      statut: 'valide',
      valide_par: profile?.id,
      valide_at: new Date().toISOString(),
      commentaire: null,
    }).eq('id', id);
    await loadPlannings();
    setProcessing(false);
  }

  async function handleRejeter(id: string) {
    if (!commentaire.trim()) return;
    setProcessing(true);
    await supabase.from('plannings').update({
      statut: 'rejete',
      commentaire: commentaire.trim(),
    }).eq('id', id);
    setCommentaire('');
    setShowRejet(null);
    await loadPlannings();
    setProcessing(false);
  }

  async function handleReprendreEnBrouillon(id: string) {
    setProcessing(true);
    await supabase.from('plannings').update({ statut: 'brouillon', commentaire: null }).eq('id', id);
    await loadPlannings();
    setProcessing(false);
  }

  const stats = {
    brouillon: plannings.filter(p => p.statut === 'brouillon').length,
    soumis: plannings.filter(p => p.statut === 'soumis').length,
    valide: plannings.filter(p => p.statut === 'valide').length,
    rejete: plannings.filter(p => p.statut === 'rejete').length,
  };

  return (
    <div className="space-y-4">

      {/* Navigation semaine */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={() => setSemaine(d => getLundi(addDays(d, -7)))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-32 text-center">{semaineLabel}</span>
          <button onClick={() => setSemaine(d => getLundi(addDays(d, 7)))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Stats */}
      {plannings.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {(Object.entries(stats) as [Statut, number][]).map(([statut, nb]) => {
            const Icon = STATUT_ICON[statut];
            return (
              <div key={statut} className={`rounded-2xl p-3 text-center ${STATUT_STYLE[statut]}`}>
                <Icon className="w-5 h-5 mx-auto mb-1 opacity-70" />
                <div className="text-xl font-bold">{nb}</div>
                <div className="text-xs opacity-70">{STATUT_LABEL[statut]}</div>
              </div>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : plannings.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          Aucun planning créé pour cette semaine.
        </div>
      ) : (
        <div className="space-y-3">
          {plannings.map(p => {
            const Icon = STATUT_ICON[p.statut];
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{p.rayonNom}</span>
                      <span className="text-xs text-gray-400">{p.depNom}</span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_STYLE[p.statut]}`}>
                        <Icon className="w-3 h-3" />
                        {STATUT_LABEL[p.statut]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{p.nb_lignes} lignes planifiées</p>
                    {p.commentaire && (
                      <div className="mt-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">
                        Motif : {p.commentaire}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions selon rôle et statut */}
                <div className="flex gap-2 mt-3 flex-wrap">

                  {/* Chef de Rayon */}
                  {isChefRayon && p.statut === 'brouillon' && (
                    <button
                      onClick={() => handleSoumettre(p.id)}
                      disabled={processing}
                      className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-amber-600 disabled:opacity-60 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Soumettre pour validation
                    </button>
                  )}

                  {isChefRayon && p.statut === 'rejete' && (
                    <button
                      onClick={() => handleReprendreEnBrouillon(p.id)}
                      disabled={processing}
                      className="flex items-center gap-1.5 bg-gray-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-gray-600 disabled:opacity-60 transition"
                    >
                      Reprendre en brouillon
                    </button>
                  )}

                  {/* Chef de Département / Admin */}
                  {(isChefDep || isAdmin) && p.statut === 'soumis' && (
                    <>
                      <button
                        onClick={() => handleValider(p.id)}
                        disabled={processing}
                        className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Valider
                      </button>
                      <button
                        onClick={() => setShowRejet(p.id)}
                        disabled={processing}
                        className="flex items-center gap-1.5 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Rejeter
                      </button>
                    </>
                  )}

                  {/* Admin peut tout faire */}
                  {isAdmin && p.statut === 'valide' && (
                    <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" /> Planning approuvé
                    </span>
                  )}

                  {isAdmin && p.statut === 'brouillon' && (
                    <button
                      onClick={() => handleSoumettre(p.id)}
                      disabled={processing}
                      className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-amber-600 disabled:opacity-60 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Soumettre
                    </button>
                  )}
                </div>

                {/* Modal rejet */}
                {showRejet === p.id && (
                  <div className="mt-3 space-y-2">
                    <textarea
                      value={commentaire}
                      onChange={e => setCommentaire(e.target.value)}
                      placeholder="Motif du rejet (obligatoire)..."
                      rows={2}
                      className="w-full px-3 py-2 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowRejet(null); setCommentaire(''); }}
                        className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium"
                      >
                        Annuler
                      </button>
                      <button
                        onClick={() => handleRejeter(p.id)}
                        disabled={!commentaire.trim() || processing}
                        className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60"
                      >
                        Confirmer le rejet
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
