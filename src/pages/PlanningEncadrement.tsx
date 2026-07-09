import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, Printer, FileText, Users2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type Poste = 'M' | 'T' | 'S' | 'R' | 'C';
type Fonction = 'employe' | 'chef_rayon' | 'assistante';

const POSTES: Poste[] = ['M', 'T', 'S', 'R', 'C'];

const POSTE_STYLE: Record<Poste, string> = {
  M: 'bg-amber-100 text-amber-800 border-amber-300',
  T: 'bg-blue-100 text-blue-800 border-blue-300',
  S: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  R: 'bg-gray-100 text-gray-500 border-gray-300',
  C: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const POSTE_LABEL: Record<Poste, string> = {
  M: 'Matin', T: 'Tranche', S: 'Soir', R: 'Repos', C: 'Congé',
};

const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M: [254, 243, 199], T: [219, 234, 254], S: [224, 231, 255], R: [243, 244, 246], C: [209, 250, 229],
};

const FONCTION_LABEL: Record<Fonction, string> = {
  employe: 'Employé', chef_rayon: 'Chef de Rayon', assistante: 'Assistante',
};

const FONCTION_STYLE: Record<Fonction, string> = {
  employe: 'bg-gray-100 text-gray-600',
  chef_rayon: 'bg-purple-50 text-purple-700',
  assistante: 'bg-blue-50 text-blue-700',
};

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

function getNumeroSemaine(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

interface Collaborateur {
  id: string;
  nom: string;
  prenom: string;
  fonction: Fonction;
  rayonNom: string;
}

type Grille = Record<string, Record<string, Poste>>;

export default function PlanningEncadrement() {
  const { profile } = useAuth();
  const isAdmin = profile ? canAccessAdmin(profile.role) : false;
  const isChefDep = profile?.role === 'chef_departement';

  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [depNom, setDepNom] = useState('');
  const [departementId, setDepartementId] = useState('');
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([]);
  const [grille, setGrille] = useState<Grille>({});
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const numSemaine = getNumeroSemaine(semaine);

  useEffect(() => { init(); }, []);
  useEffect(() => { if (departementId) loadPlanning(); }, [departementId, semaine]);

  async function init() {
    if (isChefDep && profile?.departement_id) {
      setDepartementId(profile.departement_id);
      const { data: dep } = await supabase.from('departements').select('nom').eq('id', profile.departement_id).single();
      setDepNom(dep?.nom ?? '');
    }
  }

  async function loadPlanning() {
    setLoading(true);
    setGrille({});
    setPlanningId(null);

    const { data: cols } = await supabase
      .from('collaborateurs')
      .select('id, nom, prenom, fonction, rayons(nom)')
      .eq('departement_id', departementId)
      .eq('actif', true)
      .in('fonction', ['chef_rayon', 'assistante'])
      .order('fonction')
      .order('nom');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colsList: Collaborateur[] = ((cols ?? []) as any[]).map(c => ({
      id: c.id, nom: c.nom, prenom: c.prenom, fonction: c.fonction, rayonNom: c.rayons?.nom ?? '—',
    }));
    setCollaborateurs(colsList);

    const debut = formatDate(semaine);
    const { data: plan } = await supabase
      .from('plannings_encadrement').select('id')
      .eq('departement_id', departementId).eq('semaine_debut', debut).single();

    if (plan) {
      setPlanningId(plan.id);
      const { data: lignes } = await supabase
        .from('planning_encadrement_lignes').select('*').eq('planning_id', plan.id);
      const g: Grille = {};
      for (const l of lignes ?? []) {
        if (!g[l.collaborateur_id]) g[l.collaborateur_id] = {};
        g[l.collaborateur_id][l.jour] = l.poste as Poste;
      }
      setGrille(g);
    } else {
      const g: Grille = {};
      for (const c of colsList) {
        g[c.id] = {};
        for (const j of jours) g[c.id][formatDate(j)] = 'R';
      }
      setGrille(g);
    }
    setLoading(false);
  }

  function cyclePoste(colId: string, jour: string) {
    setGrille(prev => {
      const current: Poste = prev[colId]?.[jour] ?? 'R';
      const idx = POSTES.indexOf(current);
      const next = POSTES[(idx + 1) % POSTES.length];
      return { ...prev, [colId]: { ...prev[colId], [jour]: next } };
    });
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    const debut = formatDate(semaine);
    let pid = planningId;

    if (!pid) {
      const { data } = await supabase.from('plannings_encadrement')
        .upsert({ departement_id: departementId, semaine_debut: debut, created_by: profile?.id },
          { onConflict: 'departement_id,semaine_debut' })
        .select('id').single();
      pid = data?.id ?? null;
      setPlanningId(pid);
    }

    if (!pid) { setSaving(false); return; }

    const lignes = [];
    for (const [colId, jmap] of Object.entries(grille)) {
      for (const [jour, poste] of Object.entries(jmap)) {
        lignes.push({ planning_id: pid, collaborateur_id: colId, jour, poste });
      }
    }
    await supabase.from('planning_encadrement_lignes')
      .upsert(lignes, { onConflict: 'planning_id,collaborateur_id,jour' });

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleExportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297; const margin = 14;
    const nameColW = 55;
    const colW = (pageW - margin * 2 - nameColW) / 7;

    doc.setFillColor(124, 58, 237);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text('PLANNING ENCADREMENT', margin, 11);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`${depNom}  |  S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`, margin, 19);

    let y = 28;
    const headerH = 9;
    doc.setFillColor(240, 233, 254);
    doc.rect(margin, y, nameColW, headerH, 'F');
    doc.setTextColor(50, 50, 50); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Collaborateur', margin + 2, y + 6);
    jours.forEach((j, i) => {
      const x = margin + nameColW + i * colW;
      doc.setFillColor(240, 233, 254); doc.rect(x, y, colW, headerH, 'F');
      doc.setFontSize(7.5);
      doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 6, { align: 'center' });
    });
    y += headerH;

    const rowH = 11;
    collaborateurs.forEach((c, idx) => {
      const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
      doc.setFillColor(...bg); doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
      doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(c.nom, margin + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text(`${c.prenom} — ${FONCTION_LABEL[c.fonction]} (${c.rayonNom})`, margin + 2, y + 8.5);
      jours.forEach((j, i) => {
        const poste: Poste = grille[c.id]?.[formatDate(j)] ?? 'R';
        const x = margin + nameColW + i * colW;
        doc.setFillColor(...POSTE_FILL[poste]); doc.rect(x + 1, y + 1, colW - 2, rowH - 2, 'F');
        doc.setTextColor(30, 30, 30); doc.setFontSize(9); doc.setFont('helvetica', 'bold');
        doc.text(poste, x + colW / 2, y + 7, { align: 'center' });
      });
      y += rowH;
    });
    doc.setDrawColor(210, 210, 210);
    doc.rect(margin, 28, pageW - margin * 2, y - 28);
    doc.line(margin + nameColW, 28, margin + nameColW, y);
    jours.forEach((_, i) => doc.line(margin + nameColW + i * colW, 28, margin + nameColW + i * colW, y));
    y += 5;
    doc.setFontSize(7); doc.setTextColor(100, 100, 100);
    doc.text('M = Matin   |   T = Tranche   |   S = Soir   |   R = Repos   |   C = Congé', margin, y);

    doc.save(`planning_encadrement_${depNom.toLowerCase().replace(/\s+/g, '_')}_S${numSemaine}.pdf`);
  }

  function handleExportExcel() {
    const headers = ['Nom', 'Prénom', 'Fonction', 'Rayon', ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`)];
    const rows = collaborateurs.map(c => [
      c.nom, c.prenom, FONCTION_LABEL[c.fonction], c.rayonNom,
      ...jours.map(j => grille[c.id]?.[formatDate(j)] ?? 'R'),
    ]);
    const wsData = [
      [`PLANNING ENCADREMENT — ${depNom} — S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
      [], headers, ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, ...jours.map(() => ({ wch: 10 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Encadrement');
    XLSX.writeFile(wb, `planning_encadrement_${depNom.toLowerCase().replace(/\s+/g, '_')}_S${numSemaine}.xlsx`);
  }

  const semaineLabel = `S${numSemaine} — ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`;

  if (!isAdmin && !isChefDep) {
    return (
      <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
        Accès réservé aux Chefs de Département.
      </div>
    );
  }

  return (
    <div className="space-y-4">

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
          <button onClick={() => setSemaine(d => getLundi(addDays(d, -7)))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium w-40 text-center">{semaineLabel}</span>
          <button onClick={() => setSemaine(d => getLundi(addDays(d, 7)))} className="p-1 hover:bg-gray-100 rounded-lg">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {collaborateurs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSave} disabled={saving}
              className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-60 transition">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
            </button>
            <button onClick={handleExportPDF}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
              <Printer className="w-4 h-4" /> PDF
            </button>
            <button onClick={handleExportExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition">
              <FileText className="w-4 h-4" /> Excel
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {POSTES.map(p => (
          <span key={p} className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${POSTE_STYLE[p]}`}>
            {p} = {POSTE_LABEL[p]}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
        </div>
      ) : collaborateurs.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          <Users2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Aucun Chef de Rayon ou Assistante trouvé dans ce département.
          <p className="text-xs mt-2">Assigne la fonction "Chef de Rayon" ou "Assistante" à un collaborateur depuis Administration &gt; Collaborateurs.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 min-w-40">Collaborateur</th>
                  {jours.map((j, i) => (
                    <th key={i} className="text-center px-2 py-3 font-medium text-gray-500 min-w-12">
                      <div>{JOURS[i]}</div>
                      <div className="text-gray-400 font-normal">{formatDisplay(j)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {collaborateurs.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{c.nom} {c.prenom}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${FONCTION_STYLE[c.fonction]}`}>
                          {FONCTION_LABEL[c.fonction]}
                        </span>
                      </div>
                      <div className="text-gray-400 text-xs mt-0.5">{c.rayonNom}</div>
                    </td>
                    {jours.map((j, i) => {
                      const dateStr = formatDate(j);
                      const poste: Poste = grille[c.id]?.[dateStr] ?? 'R';
                      return (
                        <td key={i} className="px-1 py-2 text-center">
                          <button
                            onClick={() => cyclePoste(c.id, dateStr)}
                            className={`w-10 h-8 rounded-lg border font-bold text-xs transition hover:opacity-80 ${POSTE_STYLE[poste]}`}
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
        </div>
      )}
    </div>
  );
}
