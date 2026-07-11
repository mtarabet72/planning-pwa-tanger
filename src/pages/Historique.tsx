import { useState, useEffect } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Printer, FileText, History } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type Poste = 'M' | 'T' | 'S' | 'R' | 'C' | 'HN' | 'MAL' | 'AT' | 'FOR';
type Statut = 'brouillon' | 'soumis' | 'valide' | 'rejete';

const POSTE_STYLE: Record<Poste, string> = {
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

const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M: [254, 243, 199], T: [219, 234, 254], S: [224, 231, 255], R: [243, 244, 246], C: [209, 250, 229],
  HN: [204, 251, 241], MAL: [255, 228, 230], AT: [254, 226, 226], FOR: [237, 233, 254],
};

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

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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

function formatDisplayLong(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function parseDate(str: string): Date {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getMoisDebut(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMoisFin(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function getLundisInMois(date: Date): Date[] {
  const debut = getMoisDebut(date);
  const fin = getMoisFin(date);
  const lundis: Date[] = [];
  const d = new Date(debut);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  while (d <= fin) {
    lundis.push(new Date(d));
    d.setDate(d.getDate() + 7);
  }
  return lundis;
}

interface SemainePlanning {
  id: string;
  semaine_debut: string;
  statut: Statut;
  rayonNom: string;
  depNom: string;
  rayon_id: string;
  nb_lignes: number;
}

interface Collaborateur {
  id: string;
  nom: string;
  prenom: string;
}

type Grille = Record<string, Record<string, Poste>>;

interface DetailPlanning {
  collaborateurs: Collaborateur[];
  grille: Grille;
  semaine: Date;
  rayonNom: string;
  depNom: string;
  statut: Statut;
}

export default function Historique() {
  const { profile } = useAuth();
  const isAdmin = canAccessAdmin(profile?.role ?? 'chef_rayon');
  const isChefDep = profile?.role === 'chef_departement';

  const now = new Date();
  const [mois, setMois] = useState<Date>(new Date(now.getFullYear(), now.getMonth(), 1));
  const [filterDep, setFilterDep] = useState('');
  const [filterRayon, setFilterRayon] = useState('');
  const [filterStatut, setFilterStatut] = useState('');

  const [departements, setDepartements] = useState<{ id: string; nom: string }[]>([]);
  const [rayons, setRayons] = useState<{ id: string; nom: string; departement_id: string }[]>([]);
  const [rayonsFiltres, setRayonsFiltres] = useState<{ id: string; nom: string }[]>([]);

  const [plannings, setPlannings] = useState<SemainePlanning[]>([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DetailPlanning | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const moisLabel = mois.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const lundis = getLundisInMois(mois);

  useEffect(() => { loadFilters(); }, []);
  useEffect(() => { loadPlannings(); }, [mois, filterDep, filterRayon, filterStatut]);

  async function loadFilters() {
    const { data: deps } = await supabase.from('departements').select('id, nom').order('nom');
    setDepartements(deps ?? []);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rayQuery: any = supabase.from('rayons').select('id, nom, departement_id').eq('actif', true).order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      rayQuery = rayQuery.eq('id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      rayQuery = rayQuery.eq('departement_id', profile.departement_id);
    }
    const { data: rays } = await rayQuery;
    setRayons(rays ?? []);
    setRayonsFiltres(rays ?? []);
  }

  async function loadPlannings() {
    setLoading(true);
    setDetail(null);

    const debutMois = formatDate(getMoisDebut(mois));
    const finMois = formatDate(getMoisFin(mois));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase
      .from('plannings')
      .select('id, semaine_debut, statut, rayon_id, rayons(nom, departements(nom))')
      .gte('semaine_debut', debutMois)
      .lte('semaine_debut', finMois)
      .order('semaine_debut', { ascending: false });

    if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      query = query.eq('rayon_id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      const { data: rays } = await supabase.from('rayons').select('id').eq('departement_id', profile.departement_id);
      query = query.in('rayon_id', (rays ?? []).map((r: { id: string }) => r.id));
    }

    if (filterRayon) query = query.eq('rayon_id', filterRayon);
    else if (filterDep) {
      const { data: rays } = await supabase.from('rayons').select('id').eq('departement_id', filterDep);
      query = query.in('rayon_id', (rays ?? []).map((r: { id: string }) => r.id));
    }
    if (filterStatut) query = query.eq('statut', filterStatut);

    const { data } = await query;

    const items: SemainePlanning[] = await Promise.all(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data ?? []).map(async (p: any) => {
        const { count } = await supabase.from('planning_lignes').select('id', { count: 'exact' }).eq('planning_id', p.id);
        return {
          id: p.id,
          semaine_debut: p.semaine_debut,
          statut: p.statut as Statut,
          rayonNom: p.rayons?.nom ?? '—',
          depNom: p.rayons?.departements?.nom ?? '—',
          rayon_id: p.rayon_id,
          nb_lignes: count ?? 0,
        };
      })
    );

    setPlannings(items);
    setLoading(false);
  }

  async function loadDetail(p: SemainePlanning) {
    setLoadingDetail(true);
    setDetail(null);

    const { data: cols } = await supabase
      .from('collaborateurs').select('id, nom, prenom')
      .eq('rayon_id', p.rayon_id).eq('actif', true)
      .neq('fonction', 'chef_rayon').order('nom');

    const { data: lignes } = await supabase
      .from('planning_lignes').select('*').eq('planning_id', p.id);

    const grille: Grille = {};
    for (const l of lignes ?? []) {
      if (!grille[l.collaborateur_id]) grille[l.collaborateur_id] = {};
      grille[l.collaborateur_id][l.jour] = l.poste as Poste;
    }

    setDetail({
      collaborateurs: (cols as Collaborateur[]) ?? [],
      grille,
      semaine: parseDate(p.semaine_debut),
      rayonNom: p.rayonNom,
      depNom: p.depNom,
      statut: p.statut,
    });
    setLoadingDetail(false);
  }

  function exportPDF() {
    if (!detail) return;
    const jours = Array.from({ length: 7 }, (_, i) => addDays(detail.semaine, i));
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297;
    const margin = 14;
    const nameColW = 45;
    const colW = (pageW - margin * 2 - nameColW) / 7;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text(`PLANNING — ${detail.rayonNom}`, margin, 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(`Département : ${detail.depNom}  |  Semaine du ${formatDisplayLong(detail.semaine)} au ${formatDisplayLong(addDays(detail.semaine, 6))}  |  ${STATUT_LABEL[detail.statut]}`, margin, 19);

    let y = 28;
    const headerH = 9;
    doc.setFillColor(240, 242, 255);
    doc.rect(margin, y, nameColW, headerH, 'F');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text('Collaborateur', margin + 2, y + 6);
    jours.forEach((j, i) => {
      const x = margin + nameColW + i * colW;
      doc.setFillColor(240, 242, 255);
      doc.rect(x, y, colW, headerH, 'F');
      doc.setFontSize(7.5);
      doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 6, { align: 'center' });
    });
    y += headerH;

    const rowH = 10;
    detail.collaborateurs.forEach((c, idx) => {
      const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
      doc.setFillColor(...bg);
      doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text(c.nom, margin + 2, y + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text(c.prenom, margin + 2, y + 8.5);
      jours.forEach((j, i) => {
        const poste: Poste = detail.grille[c.id]?.[formatDate(j)] ?? 'R';
        const x = margin + nameColW + i * colW;
        doc.setFillColor(...POSTE_FILL[poste]);
        doc.rect(x + 1, y + 1, colW - 2, rowH - 2, 'F');
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(poste.length > 1 ? 6.5 : 9);
        doc.setFont('helvetica', 'bold');
        doc.text(poste, x + colW / 2, y + 6.5, { align: 'center' });
      });
      y += rowH;
    });

    doc.setDrawColor(210, 210, 210);
    doc.rect(margin, 28, pageW - margin * 2, y - 28);
    doc.line(margin + nameColW, 28, margin + nameColW, y);
    jours.forEach((_, i) => doc.line(margin + nameColW + i * colW, 28, margin + nameColW + i * colW, y));

    y += 5;
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('M=Matin  T=Tranche  S=Soir  R=Repos  C=Congé  HN=Horaire Normal  MAL=Maladie  AT=Accident Travail  FOR=Formation', margin, y);
    doc.save(`historique_${detail.rayonNom.toLowerCase().replace(/\s+/g, '_')}_${formatDate(detail.semaine)}.pdf`);
  }

  function exportExcel() {
    if (!detail) return;
    const jours = Array.from({ length: 7 }, (_, i) => addDays(detail.semaine, i));
    const headers = ['Collaborateur', 'Prénom', ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`), 'Travail', 'Repos/Congé', 'Absences'];
    const rows = detail.collaborateurs.map(c => {
      const postes = jours.map(j => detail.grille[c.id]?.[formatDate(j)] ?? 'R');
      const travail = postes.filter(p => ['M', 'T', 'S', 'HN'].includes(p)).length;
      const repos = postes.filter(p => ['R', 'C'].includes(p)).length;
      const absences = postes.filter(p => ['MAL', 'AT', 'FOR'].includes(p)).length;
      return [c.nom, c.prenom, ...postes, travail, repos, absences];
    });
    const wsData = [
      [`PLANNING ${detail.rayonNom} — ${detail.depNom} — Semaine du ${formatDisplayLong(detail.semaine)} au ${formatDisplayLong(addDays(detail.semaine, 6))}`],
      [], headers, ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, ...jours.map(() => ({ wch: 10 })), { wch: 10 }, { wch: 12 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    XLSX.writeFile(wb, `historique_${detail.rayonNom.toLowerCase().replace(/\s+/g, '_')}_${formatDate(detail.semaine)}.xlsx`);
  }

  const grouped: Record<string, SemainePlanning[]> = {};
  for (const p of plannings) {
    if (!grouped[p.semaine_debut]) grouped[p.semaine_debut] = [];
    grouped[p.semaine_debut].push(p);
  }

  const jours = detail ? Array.from({ length: 7 }, (_, i) => addDays(detail.semaine, i)) : [];

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={() => setMois(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-36 text-center capitalize">{moisLabel}</span>
          <button onClick={() => setMois(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {(isAdmin) && (
          <select value={filterDep} onChange={e => { setFilterDep(e.target.value); setFilterRayon(''); setRayonsFiltres(rayons.filter(r => !e.target.value || r.departement_id === e.target.value)); }}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les départements</option>
            {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </select>
        )}

        {(isAdmin || isChefDep) && (
          <select value={filterRayon} onChange={e => setFilterRayon(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les rayons</option>
            {rayonsFiltres.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
          </select>
        )}

        <select value={filterStatut} onChange={e => setFilterStatut(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les statuts</option>
          <option value="brouillon">Brouillon</option>
          <option value="soumis">Soumis</option>
          <option value="valide">Validé</option>
          <option value="rejete">Rejeté</option>
        </select>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {lundis.map(l => {
          const key = formatDate(l);
          const nb = grouped[key]?.length ?? 0;
          return (
            <div key={key} className={`shrink-0 text-center px-3 py-2 rounded-xl text-xs border ${nb > 0 ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
              <div className="font-medium">{formatDisplay(l)}</div>
              <div>{nb > 0 ? `${nb} planning${nb > 1 ? 's' : ''}` : 'Aucun'}</div>
            </div>
          );
        })}
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
      ) : plannings.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          <History className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Aucun planning trouvé pour ce mois et ces filtres.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-3">
            {Object.entries(grouped)
              .sort(([a], [b]) => b.localeCompare(a))
              .map(([debut, plans]) => {
                const d = parseDate(debut);
                return (
                  <div key={debut} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-600">
                        Semaine du {formatDisplay(d)} au {formatDisplay(addDays(d, 6))}
                      </span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {plans.map(p => (
                        <button
                          key={p.id}
                          onClick={() => loadDetail(p)}
                          className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-blue-50 transition text-left ${detail && detail.rayonNom === p.rayonNom && formatDate(detail.semaine) === p.semaine_debut ? 'bg-blue-50' : ''}`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900">{p.rayonNom}</div>
                            <div className="text-xs text-gray-400">{p.depNom} · {p.nb_lignes} lignes</div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${STATUT_STYLE[p.statut]}`}>
                            {STATUT_LABEL[p.statut]}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
          </div>

          <div>
            {loadingDetail && (
              <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-blue-500 animate-spin" /></div>
            )}
            {!loadingDetail && !detail && (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm border border-gray-100">
                Sélectionne un planning pour voir le détail.
              </div>
            )}
            {!loadingDetail && detail && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <div>
                    <span className="font-semibold text-sm">{detail.rayonNom}</span>
                    <span className="text-xs text-gray-400 ml-2">{detail.depNom}</span>
                    <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${STATUT_STYLE[detail.statut]}`}>
                      {STATUT_LABEL[detail.statut]}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={exportPDF} className="p-2 bg-emerald-50 text-emerald-600 rounded-xl hover:bg-emerald-100 transition">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={exportExcel} className="p-2 bg-green-50 text-green-600 rounded-xl hover:bg-green-100 transition">
                      <FileText className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium text-gray-500">Collaborateur</th>
                        {jours.map((j, i) => (
                          <th key={i} className="text-center px-1 py-2 font-medium text-gray-500">
                            <div>{JOURS[i]}</div>
                            <div className="text-gray-400 font-normal">{formatDisplay(j)}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detail.collaborateurs.map(c => (
                        <tr key={c.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2">
                            <div className="font-medium">{c.nom}</div>
                            <div className="text-gray-400">{c.prenom}</div>
                          </td>
                          {jours.map((j, i) => {
                            const poste: Poste = detail.grille[c.id]?.[formatDate(j)] ?? 'R';
                            return (
                              <td key={i} className="px-1 py-2 text-center">
                                <span className={`inline-flex items-center justify-center w-8 h-7 rounded-lg ${
                                  poste.length > 1 ? 'text-[9px]' : 'text-xs'
                                } font-bold ${POSTE_STYLE[poste]}`}>
                                  {poste}
                                </span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
