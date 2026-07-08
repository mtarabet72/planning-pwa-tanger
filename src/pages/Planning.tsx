import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, Plus, Printer, FileText, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type Poste = 'M' | 'T' | 'S' | 'R' | 'C';
type Statut = 'brouillon' | 'soumis' | 'valide' | 'rejete';

const POSTES: Poste[] = ['M', 'AM', 'N', 'R', 'C'];

const POSTE_STYLE: Record<Poste, string> = {
  M:  'bg-amber-100 text-amber-800 border-amber-300',
  AM: 'bg-blue-100 text-blue-800 border-blue-300',
  N:  'bg-indigo-100 text-indigo-800 border-indigo-300',
  R:  'bg-gray-100 text-gray-500 border-gray-300',
  C:  'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const POSTE_LABEL: Record<Poste, string> = {
  M: 'Matin', T: 'Tanche', S: 'Soir', R: 'Repos', C: 'Congé',
};

const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M:  [254, 243, 199],
  AM: [219, 234, 254],
  N:  [224, 231, 255],
  R:  [243, 244, 246],
  C:  [209, 250, 229],
};

const STATUT_STYLE: Record<Statut, string> = {
  brouillon: 'bg-gray-100 text-gray-600',
  soumis:    'bg-amber-100 text-amber-700',
  valide:    'bg-emerald-100 text-emerald-700',
  rejete:    'bg-red-100 text-red-700',
};

const STATUT_LABEL: Record<Statut, string> = {
  brouillon: 'Brouillon',
  soumis:    'Soumis — en attente de validation',
  valide:    'Validé ✓',
  rejete:    'Rejeté',
};

const JOURS_COURT = ['L', 'M', 'Me', 'J', 'V', 'S', 'D'];
const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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

function formatDisplayLong(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

interface Collaborateur {
  id: string;
  nom: string;
  prenom: string;
}

interface Rayon {
  id: string;
  nom: string;
  departement_id: string;
  departements?: { nom: string };
}

type Grille = Record<string, Record<string, Poste>>;

export default function Planning() {
  const { profile } = useAuth();
  const isAdmin = profile ? canAccessAdmin(profile.role) : false;
  const isChefDep = profile?.role === 'chef_departement';
  const isChefRayon = profile?.role === 'chef_rayon';

  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [rayons, setRayons] = useState<Rayon[]>([]);
  const [rayonId, setRayonId] = useState<string>('');
  const [rayonNom, setRayonNom] = useState<string>('');
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([]);
  const [grille, setGrille] = useState<Grille>({});
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [planningStatut, setPlanningStatut] = useState<Statut>('brouillon');
  const [planningCommentaire, setPlanningCommentaire] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Swipe
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const readOnly = planningStatut === 'soumis' || planningStatut === 'valide';

  useEffect(() => { loadRayons(); }, []);
  useEffect(() => { if (rayonId) loadPlanning(); }, [rayonId, semaine]);

  async function loadRayons() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query: any = supabase.from('rayons').select('*, departements(nom)').order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      query = query.eq('id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      query = query.eq('departement_id', profile.departement_id);
    }
    const { data } = await query;
    const list = (data as Rayon[]) ?? [];
    setRayons(list);
    if (list.length === 1) {
      setRayonId(list[0].id);
      setRayonNom(list[0].nom);
    }
  }

  async function loadPlanning() {
    setLoading(true);
    setGrille({});
    setPlanningId(null);
    setPlanningStatut('brouillon');
    setPlanningCommentaire(null);

    const debut = formatDate(semaine);
    const { data: cols } = await supabase
      .from('collaborateurs').select('id, nom, prenom')
      .eq('rayon_id', rayonId).eq('actif', true).order('nom');
    setCollaborateurs((cols as Collaborateur[]) ?? []);

    const { data: plan } = await supabase
      .from('plannings').select('id, statut, commentaire')
      .eq('rayon_id', rayonId).eq('semaine_debut', debut).single();

    if (plan) {
      setPlanningId(plan.id);
      setPlanningStatut(plan.statut as Statut);
      setPlanningCommentaire(plan.commentaire);
      const { data: lignes } = await supabase
        .from('planning_lignes').select('*').eq('planning_id', plan.id);
      const g: Grille = {};
      for (const l of lignes ?? []) {
        if (!g[l.collaborateur_id]) g[l.collaborateur_id] = {};
        g[l.collaborateur_id][l.jour] = l.poste as Poste;
      }
      setGrille(g);
    } else {
      const g: Grille = {};
      for (const c of (cols as Collaborateur[]) ?? []) {
        g[c.id] = {};
        for (const j of jours) g[c.id][formatDate(j)] = 'R';
      }
      setGrille(g);
    }
    setLoading(false);
  }

  function cyclePoste(colId: string, jour: string) {
    if (readOnly) return;
    setGrille(prev => {
      const current: Poste = prev[colId]?.[jour] ?? 'R';
      const idx = POSTES.indexOf(current);
      const next = POSTES[(idx + 1) % POSTES.length];
      return { ...prev, [colId]: { ...prev[colId], [jour]: next } };
    });
    setSaved(false);
  }

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    const debut = formatDate(semaine);
    let pid = planningId;
    if (!pid) {
      const { data } = await supabase.from('plannings')
        .upsert({ rayon_id: rayonId, semaine_debut: debut, created_by: profile?.id, statut: 'brouillon' },
          { onConflict: 'rayon_id,semaine_debut' })
        .select('id').single();
      pid = data?.id ?? null;
      setPlanningId(pid);
      setPlanningStatut('brouillon');
    }
    if (!pid) { setSaving(false); return; }
    const lignes = [];
    for (const [colId, jours_map] of Object.entries(grille)) {
      for (const [jour, poste] of Object.entries(jours_map)) {
        lignes.push({ planning_id: pid, collaborateur_id: colId, jour, poste });
      }
    }
    await supabase.from('planning_lignes')
      .upsert(lignes, { onConflict: 'planning_id,collaborateur_id,jour' });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSoumettre() {
    if (!planningId) return;
    setSubmitting(true);
    await supabase.from('plannings').update({ statut: 'soumis', commentaire: null }).eq('id', planningId);
    setPlanningStatut('soumis');
    setSubmitting(false);
  }

  async function handleReprendreEnBrouillon() {
    if (!planningId) return;
    setSubmitting(true);
    await supabase.from('plannings').update({ statut: 'brouillon', commentaire: null }).eq('id', planningId);
    setPlanningStatut('brouillon');
    setPlanningCommentaire(null);
    setSubmitting(false);
  }

  function handleExportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const rayon = rayons.find(r => r.id === rayonId);
    const depNom = rayon?.departements?.nom ?? '';
    const pageW = 297; const margin = 14;
    const nameColW = 45;
    const colW = (pageW - margin * 2 - nameColW) / 7;
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('PLANNING MARJANE TANGER', margin, 11);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Rayon : ${rayonNom}${depNom ? '  |  Département : ' + depNom : ''}  |  Semaine du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`, margin, 19);
    let y = 28;
    const headerH = 9;
    doc.setFillColor(240, 242, 255);
    doc.rect(margin, y, nameColW, headerH, 'F');
    doc.setTextColor(50, 50, 50); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Collaborateur', margin + 2, y + 6);
    jours.forEach((j, i) => {
      const x = margin + nameColW + i * colW;
      doc.setFillColor(240, 242, 255); doc.rect(x, y, colW, headerH, 'F');
      doc.setFontSize(7.5);
      doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 6, { align: 'center' });
    });
    y += headerH;
    const rowH = 10;
    collaborateurs.forEach((c, idx) => {
      const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
      doc.setFillColor(...bg); doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
      doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(c.nom, margin + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text(c.prenom, margin + 2, y + 8.5);
      jours.forEach((j, i) => {
        const poste: Poste = grille[c.id]?.[formatDate(j)] ?? 'R';
        const x = margin + nameColW + i * colW;
        doc.setFillColor(...POSTE_FILL[poste]); doc.rect(x + 1, y + 1, colW - 2, rowH - 2, 'F');
        doc.setTextColor(30, 30, 30); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(poste, x + colW / 2, y + 6.5, { align: 'center' });
      });
      y += rowH;
    });
    doc.setDrawColor(210, 210, 210);
    doc.rect(margin, 28, pageW - margin * 2, y - 28);
    doc.line(margin + nameColW, 28, margin + nameColW, y);
    jours.forEach((_, i) => doc.line(margin + nameColW + i * colW, 28, margin + nameColW + i * colW, y));
    y += 5;
    doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('M = Matin  |  T = Tranche  |  S = Soir  |  R = Repos  |  C = Congé', margin, y);
    doc.setTextColor(180, 180, 180);
    doc.text(`Imprimé le ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, y, { align: 'right' });
    doc.save(`planning_${rayonNom.toLowerCase().replace(/\s+/g, '_')}_${formatDate(semaine)}.pdf`);
  }

  function handleExportExcel() {
    const headers = ['Collaborateur', 'Prénom', ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`), 'Travail', 'Repos/Congé'];
    const rows = collaborateurs.map(c => {
      const postes = jours.map(j => grille[c.id]?.[formatDate(j)] ?? 'R');
      const travail = postes.filter(p => ['M', 'T', 'S'].includes(p)).length;
      const repos = postes.filter(p => ['R', 'C'].includes(p)).length;
      return [c.nom, c.prenom, ...postes, travail, repos];
    });
    const wsData = [
      [`PLANNING MARJANE TANGER — Rayon : ${rayonNom} — Semaine du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
      [], headers, ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, ...jours.map(() => ({ wch: 12 })), { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    XLSX.writeFile(wb, `planning_${rayonNom.toLowerCase().replace(/\s+/g, '_')}_${formatDate(semaine)}.xlsx`);
  }

  // Swipe handlers
  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.targetTouches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) setSemaine(d => getLundi(addDays(d, 7)));
      else setSemaine(d => getLundi(addDays(d, -7)));
    }
  }

  const semaineLabel = `${formatDisplay(semaine)} – ${formatDisplay(addDays(semaine, 6))}`;

  return (
    <div className="space-y-3">

      {/* Contrôles */}
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {(isAdmin || isChefDep) && rayons.length > 1 && (
          <select
            value={rayonId}
            onChange={e => { setRayonId(e.target.value); const r = rayons.find(r => r.id === e.target.value); setRayonNom(r?.nom ?? ''); }}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">— Choisir un rayon —</option>
            {rayons.map(r => (
              <option key={r.id} value={r.id}>
                {r.departements?.nom ? `${r.departements.nom} › ` : ''}{r.nom}
              </option>
            ))}
          </select>
        )}

        {/* Navigation semaine avec swipe hint */}
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={() => setSemaine(d => getLundi(addDays(d, -7)))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-32 text-center">{semaineLabel}</span>
          <button onClick={() => setSemaine(d => getLundi(addDays(d, 7)))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {rayonId && collaborateurs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {!readOnly && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? '✓' : 'Sauv.'}
              </button>
            )}
            {(isChefRayon || isAdmin) && planningId && planningStatut === 'brouillon' && (
              <button onClick={handleSoumettre} disabled={submitting}
                className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span className="hidden sm:inline">Soumettre</span>
              </button>
            )}
            {(isChefRayon || isAdmin) && planningStatut === 'rejete' && (
              <button onClick={handleReprendreEnBrouillon} disabled={submitting}
                className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-600 disabled:opacity-60 transition">
                Reprendre
              </button>
            )}
            <button onClick={handleExportPDF}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
              <Printer className="w-4 h-4" />
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button onClick={handleExportExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition">
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Excel</span>
            </button>
          </div>
        )}
      </div>

      {/* Statut */}
      {planningId && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${STATUT_STYLE[planningStatut]}`}>
            {STATUT_LABEL[planningStatut]}
          </span>
          {planningCommentaire && (
            <span className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
              Motif : {planningCommentaire}
            </span>
          )}
        </div>
      )}

      {/* Légende compacte */}
      <div className="flex flex-wrap gap-1.5">
        {POSTES.map(p => (
          <span key={p} className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${POSTE_STYLE[p]}`}>
            {p} = {POSTE_LABEL[p]}
          </span>
        ))}
      </div>

      {!rayonId && (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          <Plus className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Sélectionne un rayon pour afficher le planning.
        </div>
      )}

      {rayonId && loading && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      )}

      {rayonId && !loading && collaborateurs.length === 0 && (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          Aucun collaborateur actif dans ce rayon.
        </div>
      )}

      {/* Grille avec swipe */}
      {rayonId && !loading && collaborateurs.length > 0 && (
        <div
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500 min-w-24">Collab.</th>
                  {jours.map((j, i) => (
                    <th key={i} className="text-center px-1 py-2.5 font-medium text-gray-500 min-w-10">
                      <div className="hidden sm:block">{JOURS[i]}</div>
                      <div className="sm:hidden font-bold">{JOURS_COURT[i]}</div>
                      <div className="text-gray-400 font-normal text-xs">{formatDisplay(j)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {collaborateurs.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <div className="font-medium truncate max-w-20 sm:max-w-none">{c.nom}</div>
                      <div className="text-gray-400 truncate max-w-20 sm:max-w-none hidden sm:block">{c.prenom}</div>
                    </td>
                    {jours.map((j, i) => {
                      const dateStr = formatDate(j);
                      const poste: Poste = grille[c.id]?.[dateStr] ?? 'R';
                      return (
                        <td key={i} className="px-0.5 py-1.5 text-center">
                          <button
                            onClick={() => cyclePoste(c.id, dateStr)}
                            disabled={readOnly}
                            className={`w-9 h-8 sm:w-10 rounded-lg border font-bold text-xs transition ${POSTE_STYLE[poste]} ${readOnly ? 'cursor-default opacity-80' : 'hover:opacity-80 active:scale-95'}`}
                          >
                            {poste}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Swipe hint mobile */}
          <div className="sm:hidden text-center py-2 text-xs text-gray-300">
            ← Glisse pour changer de semaine →
          </div>
        </div>
      )}
    </div>
  );
}
