import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, Printer, FileText, Shield, Crown, Search, Plus, X, Settings, Clock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type Poste = 'M' | 'T' | 'S' | 'R' | 'C' | 'HN' | 'MAL' | 'AT' | 'FOR';
type TabType = 'permanence' | 'direction';

const POSTES_CYCLE: Poste[] = ['M', 'T', 'S', 'R', 'C'];
const POSTES_SPECIAUX: Poste[] = ['HN', 'MAL', 'AT', 'FOR'];
const POSTES_TOUS: Poste[] = ['M', 'T', 'S', 'R', 'C', 'HN', 'MAL', 'AT', 'FOR'];

const POSTE_STYLE: Record<Poste, string> = {
  M:   'bg-amber-100 text-amber-800 border-amber-300',
  T:   'bg-blue-100 text-blue-800 border-blue-300',
  S:   'bg-indigo-100 text-indigo-800 border-indigo-300',
  R:   'bg-gray-100 text-gray-500 border-gray-300',
  C:   'bg-emerald-100 text-emerald-800 border-emerald-300',
  HN:  'bg-teal-100 text-teal-800 border-teal-300',
  MAL: 'bg-rose-100 text-rose-800 border-rose-300',
  AT:  'bg-red-100 text-red-800 border-red-300',
  FOR: 'bg-violet-100 text-violet-800 border-violet-300',
};

const POSTE_LABEL: Record<Poste, string> = {
  M: 'Matin', T: 'Tranche', S: 'Soir', R: 'Repos', C: 'Congé',
  HN: 'Horaire Normal', MAL: 'Maladie', AT: 'Accident Travail', FOR: 'Formation',
};

// Structure des créneaux de permanence (les horaires sont configurables, voir état `horaires`)
const CRENEAU_LABEL: Record<'M' | 'T' | 'S', string> = { M: 'Matin', T: 'Tranche', S: 'Soir' };
const CRENEAU_ORDRE: ('M' | 'T' | 'S')[] = ['M', 'T', 'S'];
const CRENEAU_DOT: Record<'M' | 'T' | 'S', string> = {
  M: 'bg-amber-500', T: 'bg-blue-500', S: 'bg-indigo-900',
};
const CRENEAU_BORDER: Record<'M' | 'T' | 'S', string> = {
  M: 'border-l-amber-500', T: 'border-l-blue-500', S: 'border-l-indigo-900',
};
const HORAIRES_DEFAUT: Record<'M' | 'T' | 'S', { debut: string; fin: string }> = {
  M: { debut: '07:00', fin: '14:30' },
  T: { debut: '14:30', fin: '22:00' },
  S: { debut: '15:30', fin: '23:00' },
};

const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M: [254, 243, 199], T: [219, 234, 254], S: [224, 231, 255], R: [243, 244, 246], C: [209, 250, 229],
  HN: [204, 251, 241], MAL: [255, 228, 230], AT: [254, 226, 226], FOR: [237, 233, 254],
};

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const LONG_PRESS_MS = 500;

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
  rayonNom?: string;
  depNom?: string;
}

type Grille = Record<string, Record<string, Poste>>;

export default function PlanningDirection() {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('permanence');
  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const numSemaine = getNumeroSemaine(semaine);
  const semaineLabel = `S${numSemaine} — ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`;

  const [posteMenu, setPosteMenu] = useState<{ colId: string; jour: string; kind: TabType } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  // --- PERMANENCE STATE ---
  const [permPlanningId, setPermPlanningId] = useState<string | null>(null);
  const [permMembres, setPermMembres] = useState<Collaborateur[]>([]);
  const [permGrille, setPermGrille] = useState<Grille>({});
  const [permLoading, setPermLoading] = useState(false);
  const [permSaving, setPermSaving] = useState(false);
  const [permSaved, setPermSaved] = useState(false);
  const [showAddMembre, setShowAddMembre] = useState(false);
  const [allCollabs, setAllCollabs] = useState<Collaborateur[]>([]);
  const [searchMembre, setSearchMembre] = useState('');
  const [permVue, setPermVue] = useState<'jour' | 'grille'>('jour');
  const [slotPicker, setSlotPicker] = useState<{ dateStr: string; poste: 'M' | 'T' | 'S' } | null>(null);
  const [searchSlot, setSearchSlot] = useState('');

  // --- HORAIRES DES CRÉNEAUX (configurable, change selon la saison) ---
  const [horaires, setHoraires] = useState<Record<'M' | 'T' | 'S', { debut: string; fin: string }>>(HORAIRES_DEFAUT);
  const [showHoraires, setShowHoraires] = useState(false);
  const [horairesDraft, setHorairesDraft] = useState<Record<'M' | 'T' | 'S', { debut: string; fin: string }>>(HORAIRES_DEFAUT);
  const [horairesSaving, setHorairesSaving] = useState(false);

  useEffect(() => { loadHoraires(); }, []);

  async function loadHoraires() {
    const { data } = await supabase.from('permanence_horaires').select('poste, heure_debut, heure_fin');
    if (data && data.length) {
      const h = { ...HORAIRES_DEFAUT };
      for (const row of data as { poste: 'M' | 'T' | 'S'; heure_debut: string; heure_fin: string }[]) {
        h[row.poste] = { debut: row.heure_debut, fin: row.heure_fin };
      }
      setHoraires(h);
    }
  }

  function openHorairesEditor() {
    setHorairesDraft(horaires);
    setShowHoraires(true);
  }

  async function handleSaveHoraires() {
    setHorairesSaving(true);
    const rows = CRENEAU_ORDRE.map(p => ({ poste: p, heure_debut: horairesDraft[p].debut, heure_fin: horairesDraft[p].fin }));
    await supabase.from('permanence_horaires').upsert(rows, { onConflict: 'poste' });
    setHoraires(horairesDraft);
    setHorairesSaving(false);
    setShowHoraires(false);
  }

  // --- DIRECTION STATE ---
  const [dirCollabs, setDirCollabs] = useState<Collaborateur[]>([]);
  const [dirGrille, setDirGrille] = useState<Grille>({});
  const [dirLoading, setDirLoading] = useState(false);
  const [dirSaving, setDirSaving] = useState(false);
  const [dirSaved, setDirSaved] = useState(false);

  useEffect(() => {
    if (activeTab === 'permanence') loadPermanence();
    else loadDirection();
  }, [activeTab, semaine]);

  // ===== PERMANENCE =====
  async function loadPermanence() {
    setPermLoading(true);
    setPermGrille({});
    setPermPlanningId(null);
    setPermMembres([]);

    const debut = formatDate(semaine);
    const { data: plan } = await supabase
      .from('plannings_permanence').select('id').eq('semaine_debut', debut).eq('type', 'permanence').single();

    if (plan) {
      setPermPlanningId(plan.id);
      const { data: membresRaw } = await supabase
        .from('permanence_membres').select('collaborateur_id, collaborateurs(nom, prenom, rayons(nom))')
        .eq('planning_id', plan.id);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const membres: Collaborateur[] = ((membresRaw ?? []) as any[]).map(m => ({
        id: m.collaborateur_id, nom: m.collaborateurs?.nom ?? '', prenom: m.collaborateurs?.prenom ?? '',
        rayonNom: m.collaborateurs?.rayons?.nom ?? '—',
      }));
      setPermMembres(membres);

      const { data: lignes } = await supabase
        .from('permanence_lignes').select('*').eq('planning_id', plan.id);
      const g: Grille = {};
      for (const l of lignes ?? []) {
        if (!g[l.collaborateur_id]) g[l.collaborateur_id] = {};
        g[l.collaborateur_id][l.jour] = l.poste as Poste;
      }
      setPermGrille(g);
    }
    setPermLoading(false);
  }

  async function loadAllCollabs() {
    const { data } = await supabase
      .from('collaborateurs').select('id, nom, prenom, rayons(nom)').eq('actif', true).order('nom');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setAllCollabs(((data ?? []) as any[]).map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, rayonNom: c.rayons?.nom ?? '—' })));
  }

  async function ensurePermPlanning(): Promise<string | null> {
    if (permPlanningId) return permPlanningId;
    const debut = formatDate(semaine);
    const { data } = await supabase
      .from('plannings_permanence')
      .upsert({ semaine_debut: debut, type: 'permanence', created_by: profile?.id }, { onConflict: 'semaine_debut,type' })
      .select('id').single();
    const pid = data?.id ?? null;
    setPermPlanningId(pid);
    return pid;
  }

  async function handleAddMembre(c: Collaborateur) {
    const pid = await ensurePermPlanning();
    if (!pid) return;
    await supabase.from('permanence_membres').upsert({ planning_id: pid, collaborateur_id: c.id }, { onConflict: 'planning_id,collaborateur_id' });
    setPermMembres(prev => [...prev, c]);
    setPermGrille(prev => ({ ...prev, [c.id]: Object.fromEntries(jours.map(j => [formatDate(j), 'R' as Poste])) }));
  }

  async function handleRemoveMembre(id: string) {
    if (!permPlanningId) return;
    await supabase.from('permanence_membres').delete().eq('planning_id', permPlanningId).eq('collaborateur_id', id);
    await supabase.from('permanence_lignes').delete().eq('planning_id', permPlanningId).eq('collaborateur_id', id);
    setPermMembres(prev => prev.filter(m => m.id !== id));
  }

  function setPermPoste(colId: string, jour: string, poste: Poste) {
    setPermGrille(prev => ({ ...prev, [colId]: { ...prev[colId], [jour]: poste } }));
    setPermSaved(false);
  }

  function cyclePermPoste(colId: string, jour: string) {
    setPermGrille(prev => {
      const current: Poste = prev[colId]?.[jour] ?? 'R';
      const idx = POSTES_CYCLE.indexOf(current);
      const next = idx === -1 ? POSTES_CYCLE[0] : POSTES_CYCLE[(idx + 1) % POSTES_CYCLE.length];
      return { ...prev, [colId]: { ...prev[colId], [jour]: next } };
    });
    setPermSaved(false);
  }

  // Qui est assigné à un créneau (Matin/Tranche/Soir) un jour donné
  function getAssigne(dateStr: string, poste: 'M' | 'T' | 'S'): Collaborateur | undefined {
    return permMembres.find(m => permGrille[m.id]?.[dateStr] === poste);
  }

  // Assigne un membre à un créneau pour un jour (libère automatiquement l'ancien titulaire)
  function assignSlot(dateStr: string, poste: 'M' | 'T' | 'S', collaborateurId: string) {
    setPermGrille(prev => {
      const next: Grille = { ...prev };
      for (const m of permMembres) {
        if (next[m.id]?.[dateStr] === poste && m.id !== collaborateurId) {
          next[m.id] = { ...next[m.id], [dateStr]: 'R' };
        }
      }
      next[collaborateurId] = { ...next[collaborateurId], [dateStr]: poste };
      return next;
    });
    setPermSaved(false);
    setSlotPicker(null);
    setSearchSlot('');
  }

  function clearSlot(dateStr: string, poste: 'M' | 'T' | 'S') {
    const current = getAssigne(dateStr, poste);
    if (!current) return;
    setPermGrille(prev => ({ ...prev, [current.id]: { ...prev[current.id], [dateStr]: 'R' } }));
    setPermSaved(false);
  }

  async function handleSavePermanence() {
    setPermSaving(true);
    const pid = await ensurePermPlanning();
    if (!pid) { setPermSaving(false); return; }
    const lignes = [];
    for (const [colId, jmap] of Object.entries(permGrille)) {
      for (const [jour, poste] of Object.entries(jmap)) {
        lignes.push({ planning_id: pid, collaborateur_id: colId, jour, poste });
      }
    }
    if (lignes.length) {
      await supabase.from('permanence_lignes').upsert(lignes, { onConflict: 'planning_id,collaborateur_id,jour' });
    }
    setPermSaving(false);
    setPermSaved(true);
    setTimeout(() => setPermSaved(false), 2000);
  }

  // ===== DIRECTION (Chefs de Département) =====
  async function loadDirection() {
    setDirLoading(true);
    setDirGrille({});

    const { data: cols } = await supabase
      .from('collaborateurs').select('id, nom, prenom, departements(nom)')
      .eq('fonction', 'chef_departement').eq('actif', true).order('nom');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const colsList: Collaborateur[] = ((cols ?? []) as any[]).map(c => ({
      id: c.id, nom: c.nom, prenom: c.prenom, depNom: c.departements?.nom ?? '—',
    }));
    setDirCollabs(colsList);

    const debutKey = formatDate(semaine);
    const { data: plan } = await supabase
      .from('plannings_permanence').select('id').eq('semaine_debut', debutKey).eq('type', 'direction').single();

    const g: Grille = {};
    for (const c of colsList) {
      g[c.id] = {};
      for (const j of jours) g[c.id][formatDate(j)] = 'R';
    }

    if (plan) {
      const { data: lignes } = await supabase
        .from('permanence_lignes').select('*').eq('planning_id', plan.id);
      for (const l of lignes ?? []) {
        if (!g[l.collaborateur_id]) g[l.collaborateur_id] = {};
        g[l.collaborateur_id][l.jour] = l.poste as Poste;
      }
    }

    setDirGrille(g);
    setDirLoading(false);
  }

  function setDirPoste(colId: string, jour: string, poste: Poste) {
    setDirGrille(prev => ({ ...prev, [colId]: { ...prev[colId], [jour]: poste } }));
    setDirSaved(false);
  }

  function cycleDirPoste(colId: string, jour: string) {
    setDirGrille(prev => {
      const current: Poste = prev[colId]?.[jour] ?? 'R';
      const idx = POSTES_CYCLE.indexOf(current);
      const next = idx === -1 ? POSTES_CYCLE[0] : POSTES_CYCLE[(idx + 1) % POSTES_CYCLE.length];
      return { ...prev, [colId]: { ...prev[colId], [jour]: next } };
    });
    setDirSaved(false);
  }

  async function handleSaveDirection() {
    setDirSaving(true);
    const debut = formatDate(semaine);
    const { data } = await supabase
      .from('plannings_permanence')
      .upsert({ semaine_debut: debut, type: 'direction', created_by: profile?.id }, { onConflict: 'semaine_debut,type' })
      .select('id').single();
    const pid = data?.id ?? null;
    if (!pid) { setDirSaving(false); return; }

    const lignes = [];
    for (const [colId, jmap] of Object.entries(dirGrille)) {
      for (const [jour, poste] of Object.entries(jmap)) {
        lignes.push({ planning_id: pid, collaborateur_id: colId, jour, poste });
      }
    }
    if (lignes.length) {
      await supabase.from('permanence_lignes').upsert(lignes, { onConflict: 'planning_id,collaborateur_id,jour' });
    }
    setDirSaving(false);
    setDirSaved(true);
    setTimeout(() => setDirSaved(false), 2000);
  }

  // ===== Appui long (partagé) =====
  function handlePressStart(colId: string, jour: string, kind: TabType) {
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setPosteMenu({ colId, jour, kind });
    }, LONG_PRESS_MS);
  }

  function handlePressEnd(colId: string, jour: string, kind: TabType) {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressTriggered.current) {
      if (kind === 'permanence') cyclePermPoste(colId, jour);
      else cycleDirPoste(colId, jour);
    }
  }

  function handlePressCancel() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  function applyPosteMenuSelection(p: Poste) {
    if (!posteMenu) return;
    if (posteMenu.kind === 'permanence') setPermPoste(posteMenu.colId, posteMenu.jour, p);
    else setDirPoste(posteMenu.colId, posteMenu.jour, p);
    setPosteMenu(null);
  }

  // ===== EXPORTS =====
  function exportPDF(kind: TabType) {
    const isPerm = kind === 'permanence';
    const collabs = isPerm ? permMembres : dirCollabs;
    const grille = isPerm ? permGrille : dirGrille;
    if (!collabs.length) return;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297; const margin = 14;
    const nameColW = 55;
    const colW = (pageW - margin * 2 - nameColW) / 7;
    const color: [number, number, number] = isPerm ? [217, 119, 6] : [220, 38, 38];

    doc.setFillColor(...color);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15); doc.setFont('helvetica', 'bold');
    doc.text(isPerm ? 'PLANNING DE PERMANENCE' : 'PLANNING CHEFS DE DÉPARTEMENT', margin, 11);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal');
    doc.text(`Marjane Tanger  |  S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`, margin, 19);

    let y = 28;
    const headerH = 9;
    doc.setFillColor(250, 240, 230);
    doc.rect(margin, y, nameColW, headerH, 'F');
    doc.setTextColor(50, 50, 50); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
    doc.text('Collaborateur', margin + 2, y + 6);
    jours.forEach((j, i) => {
      const x = margin + nameColW + i * colW;
      doc.setFillColor(250, 240, 230); doc.rect(x, y, colW, headerH, 'F');
      doc.setFontSize(7.5);
      doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 6, { align: 'center' });
    });
    y += headerH;

    const rowH = 11;
    collabs.forEach((c, idx) => {
      const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
      doc.setFillColor(...bg); doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
      doc.setTextColor(30, 30, 30); doc.setFontSize(8); doc.setFont('helvetica', 'bold');
      doc.text(c.nom, margin + 2, y + 4);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(120, 120, 120);
      doc.text(`${c.prenom}${c.rayonNom ? ' — ' + c.rayonNom : ''}${c.depNom ? ' — ' + c.depNom : ''}`, margin + 2, y + 8.5);
      jours.forEach((j, i) => {
        const poste: Poste = grille[c.id]?.[formatDate(j)] ?? 'R';
        const x = margin + nameColW + i * colW;
        doc.setFillColor(...POSTE_FILL[poste]); doc.rect(x + 1, y + 1, colW - 2, rowH - 2, 'F');
        doc.setTextColor(30, 30, 30); doc.setFontSize(poste.length > 1 ? 7 : 9); doc.setFont('helvetica', 'bold');
        doc.text(poste, x + colW / 2, y + 7, { align: 'center' });
      });
      y += rowH;
    });
    doc.setDrawColor(210, 210, 210);
    doc.rect(margin, 28, pageW - margin * 2, y - 28);
    doc.line(margin + nameColW, 28, margin + nameColW, y);
    jours.forEach((_, i) => doc.line(margin + nameColW + i * colW, 28, margin + nameColW + i * colW, y));
    y += 5;
    doc.setFontSize(6.5); doc.setTextColor(100, 100, 100);
    doc.text('M=Matin  T=Tranche  S=Soir  R=Repos  C=Congé  HN=Horaire Normal  MAL=Maladie  AT=Accident Travail  FOR=Formation', margin, y);

    doc.save(`${isPerm ? 'permanence' : 'direction'}_S${numSemaine}.pdf`);
  }

  function exportExcel(kind: TabType) {
    const isPerm = kind === 'permanence';
    const collabs = isPerm ? permMembres : dirCollabs;
    const grille = isPerm ? permGrille : dirGrille;
    if (!collabs.length) return;

    const headers = ['Nom', 'Prénom', isPerm ? 'Rayon' : 'Département', ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`)];
    const rows = collabs.map(c => [
      c.nom, c.prenom, isPerm ? c.rayonNom : c.depNom,
      ...jours.map(j => grille[c.id]?.[formatDate(j)] ?? 'R'),
    ]);
    const wsData = [
      [`${isPerm ? 'PLANNING DE PERMANENCE' : 'PLANNING CHEFS DE DÉPARTEMENT'} — S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
      [], headers, ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 16 }, { wch: 14 }, { wch: 16 }, ...jours.map(() => ({ wch: 10 }))];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPerm ? 'Permanence' : 'Direction');
    XLSX.writeFile(wb, `${isPerm ? 'permanence' : 'direction'}_S${numSemaine}.xlsx`);
  }

  const filteredCollabs = allCollabs.filter(c =>
    !permMembres.find(m => m.id === c.id) &&
    (c.nom.toLowerCase().includes(searchMembre.toLowerCase()) || c.prenom.toLowerCase().includes(searchMembre.toLowerCase()))
  );

  return (
    <div className="space-y-4">

      <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 w-fit">
        <button
          onClick={() => setActiveTab('permanence')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'permanence' ? 'bg-amber-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Shield className="w-4 h-4" /> Permanence
        </button>
        <button
          onClick={() => setActiveTab('direction')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${activeTab === 'direction' ? 'bg-red-500 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
        >
          <Crown className="w-4 h-4" /> Chefs de Département
        </button>
      </div>

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

        {activeTab === 'permanence' && (
          <div className="flex gap-2 flex-wrap">
            {permMembres.length > 0 && (
              <div className="flex gap-1 bg-white border border-gray-200 rounded-xl p-1">
                <button
                  onClick={() => setPermVue('jour')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${permVue === 'jour' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Vue Jour
                </button>
                <button
                  onClick={() => setPermVue('grille')}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${permVue === 'grille' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
                >
                  Vue Grille
                </button>
              </div>
            )}
            <button
              onClick={openHorairesEditor}
              className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 transition"
            >
              <Settings className="w-4 h-4" /> Horaires
            </button>
            <button
              onClick={() => { setShowAddMembre(true); loadAllCollabs(); }}
              className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-600 transition"
            >
              <Plus className="w-4 h-4" /> Ajouter membre
            </button>
            {permMembres.length > 0 && (
              <>
                <button onClick={handleSavePermanence} disabled={permSaving}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
                  {permSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {permSaved ? 'Sauvegardé ✓' : 'Sauvegarder'}
                </button>
                <button onClick={() => exportPDF('permanence')} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
                  <Printer className="w-4 h-4" /> PDF
                </button>
                <button onClick={() => exportExcel('permanence')} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition">
                  <FileText className="w-4 h-4" /> Excel
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 'direction' && dirCollabs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleSaveDirection} disabled={dirSaving}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
              {dirSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {dirSaved ? 'Sauvegardé ✓' : 'Sauvegarder'}
            </button>
            <button onClick={() => exportPDF('direction')} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
              <Printer className="w-4 h-4" /> PDF
            </button>
            <button onClick={() => exportExcel('direction')} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition">
              <FileText className="w-4 h-4" /> Excel
            </button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          {POSTES_CYCLE.map(p => (
            <span key={p} className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${POSTE_STYLE[p]}`}>
              {p} = {POSTE_LABEL[p]}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {POSTES_SPECIAUX.map(p => (
            <span key={p} className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${POSTE_STYLE[p]}`}>
              {p} = {POSTE_LABEL[p]}
            </span>
          ))}
          <span className="text-xs text-gray-400 ml-1">(via appui long)</span>
        </div>
      </div>

      {/* PERMANENCE TAB */}
      {activeTab === 'permanence' && (
        permLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>
        ) : permMembres.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
            <Shield className="w-8 h-8 mx-auto mb-3 opacity-30" />
            Aucun membre désigné pour la permanence cette semaine.
            <p className="text-xs mt-2">Appuie sur "Ajouter membre" pour désigner les responsables de garde.</p>
          </div>
        ) : permVue === 'jour' ? (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between">
              <div>
                <div className="font-semibold text-sm">Planning de Permanence</div>
                <div className="text-slate-300 text-xs">Semaine {numSemaine} — du {formatDisplayLong(semaine)} au {formatDisplayLong(addDays(semaine, 6))}</div>
              </div>
            </div>
            <div className="divide-y divide-gray-100">
              {jours.map((j, i) => {
                const dateStr = formatDate(j);
                const isToday = formatDate(new Date()) === dateStr;
                return (
                  <div key={i} className={`flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 ${isToday ? 'bg-amber-50/60' : ''}`}>
                    <div className="w-20 shrink-0 flex sm:block items-center gap-2">
                      <div className="text-lg font-bold text-gray-800 leading-none">{j.getDate()}</div>
                      <div className={`text-[11px] font-medium tracking-wide ${isToday ? 'text-amber-600' : 'text-gray-400'}`}>
                        {JOURS[i].toUpperCase()}{isToday ? ' · AUJ.' : ''}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 flex-1">
                      {CRENEAU_ORDRE.map(poste => {
                        const assigne = getAssigne(dateStr, poste);
                        return (
                          <button
                            key={poste}
                            onClick={() => setSlotPicker({ dateStr, poste })}
                            className={`text-left border border-gray-100 border-l-4 ${CRENEAU_BORDER[poste]} rounded-xl px-3 py-2 hover:bg-gray-50 transition group relative`}
                          >
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${CRENEAU_DOT[poste]}`} />
                              {CRENEAU_LABEL[poste]}
                            </div>
                            {assigne ? (
                              <>
                                <div className="text-sm font-semibold text-gray-800 truncate">{assigne.nom} {assigne.prenom}</div>
                                <div className="text-[11px] text-gray-400">{horaires[poste].debut} – {horaires[poste].fin}</div>
                              </>
                            ) : (
                              <div className="text-sm text-gray-300 italic">Non assigné</div>
                            )}
                            {assigne && (
                              <span
                                onClick={e => { e.stopPropagation(); clearSlot(dateStr, poste); }}
                                className="absolute top-1.5 right-1.5 p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition"
                              >
                                <X className="w-3 h-3" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-500">
              {CRENEAU_ORDRE.map(poste => (
                <span key={poste} className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${CRENEAU_DOT[poste]}`} /> {CRENEAU_LABEL[poste]} ({horaires[poste].debut}–{horaires[poste].fin})
                </span>
              ))}
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-300" /> Non assigné</span>
            </div>
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
                    <th className="px-2 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {permMembres.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-medium">{c.nom} {c.prenom}</div>
                        <div className="text-gray-400 text-xs">{c.rayonNom}</div>
                      </td>
                      {jours.map((j, i) => {
                        const dateStr = formatDate(j);
                        const poste: Poste = permGrille[c.id]?.[dateStr] ?? 'R';
                        return (
                          <td key={i} className="px-1 py-2 text-center">
                            <button
                              onMouseDown={() => handlePressStart(c.id, dateStr, 'permanence')}
                              onMouseUp={() => handlePressEnd(c.id, dateStr, 'permanence')}
                              onMouseLeave={handlePressCancel}
                              onTouchStart={() => handlePressStart(c.id, dateStr, 'permanence')}
                              onTouchEnd={() => handlePressEnd(c.id, dateStr, 'permanence')}
                              onTouchCancel={handlePressCancel}
                              onContextMenu={e => e.preventDefault()}
                              className={`w-10 h-8 rounded-lg border font-bold transition select-none hover:opacity-80 ${
                                poste.length > 1 ? 'text-[9px]' : 'text-xs'
                              } ${POSTE_STYLE[poste]}`}>
                              {poste}
                            </button>
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => handleRemoveMembre(c.id)} className="p-1.5 hover:bg-red-50 text-red-400 rounded-lg">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* DIRECTION TAB */}
      {activeTab === 'direction' && (
        dirLoading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 text-red-500 animate-spin" /></div>
        ) : dirCollabs.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
            <Crown className="w-8 h-8 mx-auto mb-3 opacity-30" />
            Aucun Chef de Département trouvé.
            <p className="text-xs mt-2">Assigne la fonction "Chef de Département" depuis Administration &gt; Collaborateurs.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 min-w-40">Chef de Département</th>
                    {jours.map((j, i) => (
                      <th key={i} className="text-center px-2 py-3 font-medium text-gray-500 min-w-12">
                        <div>{JOURS[i]}</div>
                        <div className="text-gray-400 font-normal">{formatDisplay(j)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {dirCollabs.map(c => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">
                        <div className="font-medium">{c.nom} {c.prenom}</div>
                        <div className="text-gray-400 text-xs">{c.depNom}</div>
                      </td>
                      {jours.map((j, i) => {
                        const dateStr = formatDate(j);
                        const poste: Poste = dirGrille[c.id]?.[dateStr] ?? 'R';
                        return (
                          <td key={i} className="px-1 py-2 text-center">
                            <button
                              onMouseDown={() => handlePressStart(c.id, dateStr, 'direction')}
                              onMouseUp={() => handlePressEnd(c.id, dateStr, 'direction')}
                              onMouseLeave={handlePressCancel}
                              onTouchStart={() => handlePressStart(c.id, dateStr, 'direction')}
                              onTouchEnd={() => handlePressEnd(c.id, dateStr, 'direction')}
                              onTouchCancel={handlePressCancel}
                              onContextMenu={e => e.preventDefault()}
                              className={`w-10 h-8 rounded-lg border font-bold transition select-none hover:opacity-80 ${
                                poste.length > 1 ? 'text-[9px]' : 'text-xs'
                              } ${POSTE_STYLE[poste]}`}>
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
        )
      )}

      {/* Modal ajout membre permanence */}
      {showAddMembre && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-semibold text-lg">Ajouter un membre</h3>
              <button onClick={() => { setShowAddMembre(false); setSearchMembre(''); }} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher un collaborateur..."
                  value={searchMembre}
                  onChange={e => setSearchMembre(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
              {filteredCollabs.length === 0 ? (
                <p className="text-center text-sm text-gray-400 py-8">Aucun résultat.</p>
              ) : (
                filteredCollabs.map(c => (
                  <button
                    key={c.id}
                    onClick={() => handleAddMembre(c)}
                    className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-amber-50 transition text-left"
                  >
                    <div>
                      <div className="font-medium text-sm">{c.nom} {c.prenom}</div>
                      <div className="text-xs text-gray-400">{c.rayonNom}</div>
                    </div>
                    <Plus className="w-4 h-4 text-amber-500" />
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal configuration des horaires de permanence */}
      {showHoraires && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setShowHoraires(false)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-lg flex items-center gap-2"><Clock className="w-5 h-5 text-amber-500" /> Horaires de permanence</h3>
                <p className="text-xs text-gray-400 mt-0.5">Modifiable selon la saison — s'applique à tous les plannings à venir.</p>
              </div>
              <button onClick={() => setShowHoraires(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {CRENEAU_ORDRE.map(poste => (
                <div key={poste} className={`border border-gray-100 border-l-4 ${CRENEAU_BORDER[poste]} rounded-xl p-4`}>
                  <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 mb-3">
                    <span className={`w-2 h-2 rounded-full ${CRENEAU_DOT[poste]}`} /> {CRENEAU_LABEL[poste]}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="block text-[11px] text-gray-400 mb-1">Début</label>
                      <input
                        type="time"
                        value={horairesDraft[poste].debut}
                        onChange={e => setHorairesDraft(prev => ({ ...prev, [poste]: { ...prev[poste], debut: e.target.value } }))}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <span className="text-gray-300 mt-4">→</span>
                    <div className="flex-1">
                      <label className="block text-[11px] text-gray-400 mb-1">Fin</label>
                      <input
                        type="time"
                        value={horairesDraft[poste].fin}
                        onChange={e => setHorairesDraft(prev => ({ ...prev, [poste]: { ...prev[poste], fin: e.target.value } }))}
                        className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 p-6 pt-0">
              <button onClick={() => setShowHoraires(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition">
                Annuler
              </button>
              <button
                onClick={handleSaveHoraires}
                disabled={horairesSaving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition"
              >
                {horairesSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal assignation créneau (vue Jour) */}
      {slotPicker && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => { setSlotPicker(null); setSearchSlot(''); }}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h3 className="font-semibold text-lg">
                  {CRENEAU_LABEL[slotPicker.poste]} — {horaires[slotPicker.poste].debut} – {horaires[slotPicker.poste].fin}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(slotPicker.dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
              </div>
              <button onClick={() => { setSlotPicker(null); setSearchSlot(''); }} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Rechercher un membre de la permanence..."
                  value={searchSlot}
                  onChange={e => setSearchSlot(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-1">
              {permMembres
                .filter(c => c.nom.toLowerCase().includes(searchSlot.toLowerCase()) || c.prenom.toLowerCase().includes(searchSlot.toLowerCase()))
                .map(c => {
                  const dejaAssigne = permGrille[c.id]?.[slotPicker.dateStr] === slotPicker.poste;
                  return (
                    <button
                      key={c.id}
                      onClick={() => assignSlot(slotPicker.dateStr, slotPicker.poste, c.id)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition text-left ${dejaAssigne ? 'bg-amber-50' : 'hover:bg-gray-50'}`}
                    >
                      <div>
                        <div className="font-medium text-sm">{c.nom} {c.prenom}</div>
                        <div className="text-xs text-gray-400">{c.rayonNom}</div>
                      </div>
                      {dejaAssigne && <span className="text-xs font-medium text-amber-600">Assigné ✓</span>}
                    </button>
                  );
                })}
              {permMembres.length === 0 && (
                <p className="text-center text-sm text-gray-400 py-8">Aucun membre. Ajoute d'abord des membres à la permanence.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Menu de sélection (appui long) */}
      {posteMenu && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setPosteMenu(null)}>
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100">
              <h3 className="font-semibold text-sm">Choisir un code</h3>
              <button onClick={() => setPosteMenu(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 grid grid-cols-3 gap-2">
              {POSTES_TOUS.map(p => (
                <button
                  key={p}
                  onClick={() => applyPosteMenuSelection(p)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-xl border font-bold transition hover:opacity-80 ${POSTE_STYLE[p]}`}
                >
                  <span className="text-sm">{p}</span>
                  <span className="text-[9px] font-normal leading-tight text-center px-1">{POSTE_LABEL[p]}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
