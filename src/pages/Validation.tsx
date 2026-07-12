import { useState, useEffect } from 'react';
import { Loader2, CheckCircle, XCircle, Clock, Send, ChevronLeft, ChevronRight, Calendar, Users2, Shield } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';

type StatutRayon = 'brouillon' | 'soumis_dept' | 'soumis_admin' | 'valide' | 'rejete';
type StatutEnc = 'brouillon' | 'soumis' | 'valide' | 'rejete';
type StatutPerm = 'brouillon' | 'valide';
type TabType = 'rayon' | 'encadrement' | 'direction';

const STATUT_RAYON_STYLE: Record<StatutRayon, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  soumis_dept: 'bg-amber-100 text-amber-700',
  soumis_admin: 'bg-blue-100 text-blue-700',
  valide: 'bg-emerald-100 text-emerald-700',
  rejete: 'bg-red-100 text-red-700',
};
const STATUT_RAYON_LABEL: Record<StatutRayon, string> = {
  brouillon: 'Brouillon',
  soumis_dept: 'Soumis (Département)',
  soumis_admin: 'Soumis (Admin)',
  valide: 'Validé (Final)',
  rejete: 'Rejeté',
};
const STATUT_RAYON_ICON: Record<StatutRayon, React.ElementType> = {
  brouillon: Clock, soumis_dept: Send, soumis_admin: Send, valide: CheckCircle, rejete: XCircle,
};

const STATUT_ENC_STYLE: Record<StatutEnc, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  soumis: 'bg-amber-100 text-amber-700',
  valide: 'bg-emerald-100 text-emerald-700',
  rejete: 'bg-red-100 text-red-700',
};
const STATUT_ENC_LABEL: Record<StatutEnc, string> = {
  brouillon: 'Brouillon', soumis: 'Soumis (Admin)', valide: 'Validé', rejete: 'Rejeté',
};
const STATUT_ENC_ICON: Record<StatutEnc, React.ElementType> = {
  brouillon: Clock, soumis: Send, valide: CheckCircle, rejete: XCircle,
};

const STATUT_PERM_STYLE: Record<StatutPerm, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  valide: 'bg-emerald-100 text-emerald-700',
};
const STATUT_PERM_LABEL: Record<StatutPerm, string> = {
  brouillon: 'Brouillon', valide: 'Validé',
};

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

interface RayonPlanning {
  id: string;
  rayon_id: string;
  departement_id: string;
  statut: StatutRayon;
  commentaire: string | null;
  rayonNom: string;
  depNom: string;
  nb_lignes: number;
}

interface EncPlanning {
  id: string;
  departement_id: string;
  statut: StatutEnc;
  commentaire: string | null;
  depNom: string;
  nb_lignes: number;
}

interface PermPlanning {
  id: string;
  type: 'permanence' | 'direction';
  statut: StatutPerm;
  nb_membres: number;
}

export default function Validation() {
  const { profile } = useAuth();
  const isAdmin = canAccessAdmin(profile?.role ?? 'chef_rayon');
  const isChefDep = profile?.role === 'chef_departement';
  const isChefRayon = profile?.role === 'chef_rayon';

  const [activeTab, setActiveTab] = useState<TabType>('rayon');
  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [loading, setLoading] = useState(false);
  const [commentaire, setCommentaire] = useState('');
  const [showRejet, setShowRejet] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [rayonPlannings, setRayonPlannings] = useState<RayonPlanning[]>([]);
  const [encPlannings, setEncPlannings] = useState<EncPlanning[]>([]);
  const [permPlannings, setPermPlannings] = useState<PermPlanning[]>([]);

  const semaineLabel = `${formatDisplay(semaine)} – ${formatDisplay(addDays(semaine, 6))}`;

  useEffect(() => { loadAll(); }, [activeTab, semaine]);

  async function loadAll() {
    setLoading(true);
    if (activeTab === 'rayon') await loadRayon();
    else if (activeTab === 'encadrement') await loadEncadrement();
    else await loadDirection();
    setLoading(false);
  }

  // ============ RAYON ============
  async function loadRayon() {
    const debut = formatDate(semaine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('plannings')
      .select('id, rayon_id, statut, commentaire, rayons(nom, departement_id, departements(nom))')
      .eq('semaine_debut', debut)
      .order('statut');

    if (isChefRayon && profile?.rayon_id) {
      query = query.eq('rayon_id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      const { data: rays } = await supabase.from('rayons').select('id').eq('departement_id', profile.departement_id);
      query = query.in('rayon_id', (rays ?? []).map((r: { id: string }) => r.id));
    }

    const { data } = await query;
    const items: RayonPlanning[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map(async (p: any) => {
        const { count } = await supabase.from('planning_lignes').select('id', { count: 'exact' }).eq('planning_id', p.id);
        return {
          id: p.id, rayon_id: p.rayon_id, departement_id: p.rayons?.departement_id ?? '',
          statut: p.statut as StatutRayon, commentaire: p.commentaire,
          rayonNom: p.rayons?.nom ?? '—', depNom: p.rayons?.departements?.nom ?? '—',
          nb_lignes: count ?? 0,
        };
      })
    );
    setRayonPlannings(items);
  }

  async function handleSoumettreRayon(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings').update({ statut: 'soumis_dept', commentaire: null }).eq('id', id);
    if (error) setErrorMsg(`Échec de la soumission : ${error.message}`);
    await loadRayon();
    setProcessing(false);
  }

  async function handleValiderDept(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings').update({ statut: 'soumis_admin', commentaire: null }).eq('id', id);
    if (error) setErrorMsg(`Échec de la validation : ${error.message}`);
    await loadRayon();
    setProcessing(false);
  }

  async function handleValiderFinal(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings').update({
      statut: 'valide', valide_par: profile?.id, valide_at: new Date().toISOString(), commentaire: null,
    }).eq('id', id);
    if (error) setErrorMsg(`Échec de la validation finale : ${error.message}`);
    await loadRayon();
    setProcessing(false);
  }

  async function handleRejeterRayon(id: string) {
    if (!commentaire.trim()) return;
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings').update({ statut: 'brouillon', commentaire: commentaire.trim() }).eq('id', id);
    if (error) setErrorMsg(`Échec du rejet : ${error.message}`);
    setCommentaire(''); setShowRejet(null);
    await loadRayon();
    setProcessing(false);
  }

  // ============ ENCADREMENT ============
  async function loadEncadrement() {
    const debut = formatDate(semaine);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('plannings_encadrement')
      .select('id, departement_id, statut, commentaire, departements(nom)')
      .eq('semaine_debut', debut)
      .order('statut');

    if (isChefDep && profile?.departement_id) {
      query = query.eq('departement_id', profile.departement_id);
    }

    const { data } = await query;
    const items: EncPlanning[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map(async (p: any) => {
        const { count } = await supabase.from('planning_encadrement_lignes').select('id', { count: 'exact' }).eq('planning_id', p.id);
        return {
          id: p.id, departement_id: p.departement_id, statut: p.statut as StatutEnc,
          commentaire: p.commentaire, depNom: p.departements?.nom ?? '—', nb_lignes: count ?? 0,
        };
      })
    );
    setEncPlannings(items);
  }

  async function handleSoumettreEnc(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings_encadrement').update({ statut: 'soumis', commentaire: null }).eq('id', id);
    if (error) setErrorMsg(`Échec de la soumission : ${error.message}`);
    await loadEncadrement();
    setProcessing(false);
  }

  async function handleValiderEnc(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings_encadrement').update({
      statut: 'valide', valide_par: profile?.id, valide_at: new Date().toISOString(), commentaire: null,
    }).eq('id', id);
    if (error) setErrorMsg(`Échec de la validation : ${error.message}`);
    await loadEncadrement();
    setProcessing(false);
  }

  async function handleRejeterEnc(id: string) {
    if (!commentaire.trim()) return;
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings_encadrement').update({ statut: 'brouillon', commentaire: commentaire.trim() }).eq('id', id);
    if (error) setErrorMsg(`Échec du rejet : ${error.message}`);
    setCommentaire(''); setShowRejet(null);
    await loadEncadrement();
    setProcessing(false);
  }

  // ============ PERMANENCE & DIRECTION ============
  async function loadDirection() {
    const debut = formatDate(semaine);
    const { data } = await supabase
      .from('plannings_permanence')
      .select('id, type, statut')
      .eq('semaine_debut', debut);

    const items: PermPlanning[] = await Promise.all(
      (data ?? []).map(async (p: { id: string; type: string; statut: string }) => {
        let nb = 0;
        if (p.type === 'permanence') {
          const { count } = await supabase.from('permanence_membres').select('id', { count: 'exact' }).eq('planning_id', p.id);
          nb = count ?? 0;
        } else {
          const { count } = await supabase.from('permanence_lignes').select('collaborateur_id', { count: 'exact' }).eq('planning_id', p.id);
          nb = count ?? 0;
        }
        return { id: p.id, type: p.type as 'permanence' | 'direction', statut: p.statut as StatutPerm, nb_membres: nb };
      })
    );
    setPermPlannings(items);
  }

  async function handleValiderPerm(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings_permanence').update({
      statut: 'valide', valide_par: profile?.id, valide_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) setErrorMsg(`Échec de la validation : ${error.message}`);
    await loadDirection();
    setProcessing(false);
  }

  async function handleReprendrePerm(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings_permanence').update({ statut: 'brouillon' }).eq('id', id);
    if (error) setErrorMsg(`Échec : ${error.message}`);
    await loadDirection();
    setProcessing(false);
  }

  async function handleReprendreEncBrouillon(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings_encadrement').update({ statut: 'brouillon', commentaire: null }).eq('id', id);
    if (error) setErrorMsg(`Échec : ${error.message}`);
    await loadEncadrement();
    setProcessing(false);
  }

  async function handleReprendreRayonBrouillon(id: string) {
    setProcessing(true); setErrorMsg(null);
    const { error } = await supabase.from('plannings').update({ statut: 'brouillon', commentaire: null }).eq('id', id);
    if (error) setErrorMsg(`Échec : ${error.message}`);
    await loadRayon();
    setProcessing(false);
  }

  const tabs = [
    { id: 'rayon', label: 'Plannings Rayon', icon: Calendar, hidden: false },
    { id: 'encadrement', label: 'Encadrement', icon: Users2, hidden: !(isAdmin || isChefDep) },
    { id: 'direction', label: 'Permanence & Direction', icon: Shield, hidden: !isAdmin },
  ] as const;

  const statsRayon = {
    brouillon: rayonPlannings.filter(p => p.statut === 'brouillon').length,
    soumis_dept: rayonPlannings.filter(p => p.statut === 'soumis_dept').length,
    soumis_admin: rayonPlannings.filter(p => p.statut === 'soumis_admin').length,
    valide: rayonPlannings.filter(p => p.statut === 'valide').length,
    rejete: rayonPlannings.filter(p => p.statut === 'rejete').length,
  };

  return (
    <div className="space-y-4">

      <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 w-fit flex-wrap">
        {tabs.filter(t => !t.hidden).map(t => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={() => setSemaine(d => getLundi(addDays(d, -7)))} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-medium w-32 text-center">{semaineLabel}</span>
          <button onClick={() => setSemaine(d => getLundi(addDays(d, 7)))} className="p-1 hover:bg-gray-100 rounded-lg"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600 text-xs font-medium shrink-0">Fermer</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
      ) : (
        <>
          {/* ===== ONGLET RAYON ===== */}
          {activeTab === 'rayon' && (
            rayonPlannings.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">Aucun planning créé pour cette semaine.</div>
            ) : (
              <>
                <div className="grid grid-cols-5 gap-2">
                  {(Object.entries(statsRayon) as [StatutRayon, number][]).map(([statut, nb]) => {
                    const Icon = STATUT_RAYON_ICON[statut];
                    return (
                      <div key={statut} className={`rounded-2xl p-2.5 text-center ${STATUT_RAYON_STYLE[statut]}`}>
                        <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
                        <div className="text-lg font-bold">{nb}</div>
                        <div className="text-[10px] opacity-70 leading-tight">{STATUT_RAYON_LABEL[statut]}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="space-y-3">
                  {rayonPlannings.map(p => {
                    const Icon = STATUT_RAYON_ICON[p.statut];
                    const peutValiderDept = (isChefDep || isAdmin) && p.statut === 'soumis_dept';
                    const peutValiderFinal = isAdmin && p.statut === 'soumis_admin';
                    return (
                      <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-gray-900">{p.rayonNom}</span>
                          <span className="text-xs text-gray-400">{p.depNom}</span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_RAYON_STYLE[p.statut]}`}>
                            <Icon className="w-3 h-3" /> {STATUT_RAYON_LABEL[p.statut]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{p.nb_lignes} lignes planifiées</p>
                        {p.commentaire && (
                          <div className="mt-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">Motif : {p.commentaire}</div>
                        )}

                        <div className="flex gap-2 mt-3 flex-wrap">
                          {(isChefRayon || isAdmin) && p.statut === 'brouillon' && (
                            <button onClick={() => handleSoumettreRayon(p.id)} disabled={processing}
                              className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-amber-600 disabled:opacity-60 transition">
                              <Send className="w-3.5 h-3.5" /> Soumettre au Département
                            </button>
                          )}
                          {(isChefRayon || isAdmin) && p.statut === 'rejete' && (
                            <button onClick={() => handleReprendreRayonBrouillon(p.id)} disabled={processing}
                              className="flex items-center gap-1.5 bg-gray-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-gray-600 disabled:opacity-60 transition">
                              Reprendre en brouillon
                            </button>
                          )}
                          {peutValiderDept && (
                            <>
                              <button onClick={() => handleValiderDept(p.id)} disabled={processing}
                                className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-blue-700 disabled:opacity-60 transition">
                                <CheckCircle className="w-3.5 h-3.5" /> Valider et transmettre à l'Admin
                              </button>
                              <button onClick={() => setShowRejet(p.id)} disabled={processing}
                                className="flex items-center gap-1.5 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition">
                                <XCircle className="w-3.5 h-3.5" /> Rejeter
                              </button>
                            </>
                          )}
                          {peutValiderFinal && (
                            <>
                              <button onClick={() => handleValiderFinal(p.id)} disabled={processing}
                                className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition">
                                <CheckCircle className="w-3.5 h-3.5" /> Validation finale
                              </button>
                              <button onClick={() => setShowRejet(p.id)} disabled={processing}
                                className="flex items-center gap-1.5 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition">
                                <XCircle className="w-3.5 h-3.5" /> Rejeter
                              </button>
                            </>
                          )}
                          {isAdmin && p.statut === 'valide' && (
                            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" /> Planning approuvé
                            </span>
                          )}
                        </div>

                        {showRejet === p.id && (
                          <div className="mt-3 space-y-2">
                            <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                              placeholder="Motif du rejet (obligatoire)..." rows={2}
                              className="w-full px-3 py-2 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
                            <div className="flex gap-2">
                              <button onClick={() => { setShowRejet(null); setCommentaire(''); }}
                                className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium">Annuler</button>
                              <button onClick={() => handleRejeterRayon(p.id)} disabled={!commentaire.trim() || processing}
                                className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60">
                                Confirmer le rejet
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )
          )}

          {/* ===== ONGLET ENCADREMENT ===== */}
          {activeTab === 'encadrement' && (
            encPlannings.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">Aucun planning Encadrement pour cette semaine.</div>
            ) : (
              <div className="space-y-3">
                {encPlannings.map(p => {
                  const Icon = STATUT_ENC_ICON[p.statut];
                  return (
                    <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-gray-900">{p.depNom}</span>
                        <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_ENC_STYLE[p.statut]}`}>
                          <Icon className="w-3 h-3" /> {STATUT_ENC_LABEL[p.statut]}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">{p.nb_lignes} lignes planifiées</p>
                      {p.commentaire && (
                        <div className="mt-2 bg-red-50 text-red-700 text-xs rounded-xl px-3 py-2">Motif : {p.commentaire}</div>
                      )}

                      <div className="flex gap-2 mt-3 flex-wrap">
                        {(isChefDep || isAdmin) && p.statut === 'brouillon' && (
                          <button onClick={() => handleSoumettreEnc(p.id)} disabled={processing}
                            className="flex items-center gap-1.5 bg-amber-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-amber-600 disabled:opacity-60 transition">
                            <Send className="w-3.5 h-3.5" /> Soumettre à l'Admin
                          </button>
                        )}
                        {(isChefDep || isAdmin) && p.statut === 'rejete' && (
                          <button onClick={() => handleReprendreEncBrouillon(p.id)} disabled={processing}
                            className="flex items-center gap-1.5 bg-gray-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-gray-600 disabled:opacity-60 transition">
                            Reprendre en brouillon
                          </button>
                        )}
                        {isAdmin && p.statut === 'soumis' && (
                          <>
                            <button onClick={() => handleValiderEnc(p.id)} disabled={processing}
                              className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition">
                              <CheckCircle className="w-3.5 h-3.5" /> Validation finale
                            </button>
                            <button onClick={() => setShowRejet(p.id)} disabled={processing}
                              className="flex items-center gap-1.5 bg-red-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-red-600 disabled:opacity-60 transition">
                              <XCircle className="w-3.5 h-3.5" /> Rejeter
                            </button>
                          </>
                        )}
                      </div>

                      {showRejet === p.id && (
                        <div className="mt-3 space-y-2">
                          <textarea value={commentaire} onChange={e => setCommentaire(e.target.value)}
                            placeholder="Motif du rejet (obligatoire)..." rows={2}
                            className="w-full px-3 py-2 rounded-xl border border-red-200 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
                          <div className="flex gap-2">
                            <button onClick={() => { setShowRejet(null); setCommentaire(''); }}
                              className="flex-1 py-2 rounded-xl border border-gray-200 text-gray-600 text-xs font-medium">Annuler</button>
                            <button onClick={() => handleRejeterEnc(p.id)} disabled={!commentaire.trim() || processing}
                              className="flex-1 py-2 rounded-xl bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-60">
                              Confirmer le rejet
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          )}

          {/* ===== ONGLET PERMANENCE & DIRECTION ===== */}
          {activeTab === 'direction' && (
            permPlannings.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">Aucun planning de Permanence ou Direction pour cette semaine.</div>
            ) : (
              <div className="space-y-3">
                {permPlannings.map(p => (
                  <div key={p.id} className="bg-white rounded-2xl border border-gray-100 p-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">
                        {p.type === 'permanence' ? 'Planning de Permanence' : 'Planning Chefs de Département'}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_PERM_STYLE[p.statut]}`}>
                        {p.statut === 'valide' ? <CheckCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                        {STATUT_PERM_LABEL[p.statut]}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{p.nb_membres} collaborateur(s) planifié(s)</p>

                    <div className="flex gap-2 mt-3 flex-wrap">
                      {isAdmin && p.statut === 'brouillon' && (
                        <button onClick={() => handleValiderPerm(p.id)} disabled={processing}
                          className="flex items-center gap-1.5 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-emerald-700 disabled:opacity-60 transition">
                          <CheckCircle className="w-3.5 h-3.5" /> Validation finale
                        </button>
                      )}
                      {isAdmin && p.statut === 'valide' && (
                        <button onClick={() => handleReprendrePerm(p.id)} disabled={processing}
                          className="flex items-center gap-1.5 bg-gray-500 text-white px-4 py-2 rounded-xl text-xs font-medium hover:bg-gray-600 disabled:opacity-60 transition">
                          Déverrouiller (reprendre en brouillon)
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
