import { useState, useEffect } from 'react';
import { Loader2, Printer, FileText, Calendar, BarChart3, Sun } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type Poste = 'M' | 'T' | 'S' | 'R' | 'C';

const POSTE_STYLE: Record<Poste, string> = {
  M: 'bg-amber-100 text-amber-800',
  T: 'bg-blue-100 text-blue-800',
  S: 'bg-indigo-100 text-indigo-800',
  R: 'bg-gray-100 text-gray-500',
  C: 'bg-emerald-100 text-emerald-800',
};

const POSTE_LABEL: Record<Poste, string> = {
  M: 'Matin', T: 'Tranche', S: 'Soir', R: 'Repos', C: 'Congé',
};

const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

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
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
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

function getMonth(date: Date): { debut: Date; fin: Date } {
  const debut = new Date(date.getFullYear(), date.getMonth(), 1);
  const fin = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { debut, fin };
}

interface RayonLigne {
  rayonNom: string;
  collaborateurs: { nom: string; prenom: string; poste: Poste }[];
}

interface SemaineLigne {
  rayonNom: string;
  depNom: string;
  collaborateurs: { nom: string; prenom: string; postes: Poste[] }[];
}

interface MoisLigne {
  nom: string;
  prenom: string;
  rayonNom: string;
  travail: number;
  repos: number;
  conge: number;
  total: number;
}

type TabType = 'journalier' | 'hebdomadaire' | 'mensuel';

export default function Rapports() {
  const { profile } = useAuth();
  const isAdmin = canAccessAdmin(profile?.role ?? 'chef_rayon');
  const isChefDep = profile?.role === 'chef_departement';

  const [activeTab, setActiveTab] = useState<TabType>('journalier');
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState<string>(formatDate(new Date()));
  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [mois, setMois] = useState<string>(`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  const [filterDep, setFilterDep] = useState<string>('');

  const [departements, setDepartements] = useState<{ id: string; nom: string }[]>([]);
  const [journalierData, setJournalierData] = useState<RayonLigne[]>([]);
  const [hebdoData, setHebdoData] = useState<SemaineLigne[]>([]);
  const [moisData, setMoisData] = useState<MoisLigne[]>([]);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));

  useEffect(() => { loadDeps(); }, []);
  useEffect(() => { loadReport(); }, [activeTab, date, semaine, mois, filterDep]);

  async function loadDeps() {
    const { data } = await supabase.from('departements').select('id, nom').order('nom');
    setDepartements(data ?? []);
  }

  async function loadReport() {
    setLoading(true);
    if (activeTab === 'journalier') await loadJournalier();
    else if (activeTab === 'hebdomadaire') await loadHebdo();
    else await loadMensuel();
    setLoading(false);
  }

  async function loadJournalier() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rayQuery: any = supabase.from('rayons').select('id, nom, departement_id').eq('actif', true).order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_id) rayQuery = rayQuery.eq('id', profile.rayon_id);
    else if (isChefDep && profile?.departement_id) rayQuery = rayQuery.eq('departement_id', profile.departement_id);
    else if (filterDep) rayQuery = rayQuery.eq('departement_id', filterDep);
    const { data: rayons } = await rayQuery;
    if (!rayons?.length) { setJournalierData([]); return; }

    const lundi = formatDate(getLundi(new Date(date)));
    const result: RayonLigne[] = [];

    for (const rayon of rayons) {
      const { data: plan } = await supabase
        .from('plannings').select('id').eq('rayon_id', rayon.id).eq('semaine_debut', lundi).single();
      if (!plan) continue;

      // Toutes les tranches de présence (M, T, S) — pas seulement Matin
      const { data: lignes } = await supabase
        .from('planning_lignes').select('collaborateur_id, poste')
        .eq('planning_id', plan.id).eq('jour', date)
        .in('poste', ['M', 'T', 'S']);

      if (!lignes?.length) continue;

      const cols: { nom: string; prenom: string; poste: Poste }[] = [];
      for (const l of lignes) {
        const { data: col } = await supabase
          .from('collaborateurs').select('nom, prenom').eq('id', l.collaborateur_id).single();
        if (col) cols.push({ nom: col.nom, prenom: col.prenom, poste: l.poste as Poste });
      }
      // Trier par tranche (M, T, S) puis par nom
      const ordre: Record<Poste, number> = { M: 0, T: 1, S: 2, R: 3, C: 4 };
      cols.sort((a, b) => ordre[a.poste] - ordre[b.poste] || a.nom.localeCompare(b.nom));
      if (cols.length) result.push({ rayonNom: rayon.nom, collaborateurs: cols });
    }
    setJournalierData(result);
  }

  async function loadHebdo() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rayQuery: any = supabase.from('rayons').select('id, nom, departements(nom)').eq('actif', true).order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_id) rayQuery = rayQuery.eq('id', profile.rayon_id);
    else if (isChefDep && profile?.departement_id) rayQuery = rayQuery.eq('departement_id', profile.departement_id);
    else if (filterDep) rayQuery = rayQuery.eq('departement_id', filterDep);
    const { data: rayons } = await rayQuery;
    if (!rayons?.length) { setHebdoData([]); return; }

    const debut = formatDate(semaine);
    const result: SemaineLigne[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const rayon of rayons as any[]) {
      const { data: plan } = await supabase
        .from('plannings').select('id').eq('rayon_id', rayon.id).eq('semaine_debut', debut).single();

      const { data: cols } = await supabase
        .from('collaborateurs').select('id, nom, prenom').eq('rayon_id', rayon.id).eq('actif', true).order('nom');

      if (!cols?.length) continue;

      const colsData = await Promise.all(cols.map(async (c: { id: string; nom: string; prenom: string }) => {
        const postes: Poste[] = [];
        for (const j of jours) {
          if (plan) {
            const { data: l } = await supabase
              .from('planning_lignes').select('poste')
              .eq('planning_id', plan.id).eq('collaborateur_id', c.id).eq('jour', formatDate(j)).single();
            postes.push((l?.poste as Poste) ?? 'R');
          } else {
            postes.push('R');
          }
        }
        return { nom: c.nom, prenom: c.prenom, postes };
      }));

      result.push({ rayonNom: rayon.nom, depNom: rayon.departements?.nom ?? '', collaborateurs: colsData });
    }
    setHebdoData(result);
  }

  async function loadMensuel() {
    const [year, month] = mois.split('-').map(Number);
    const { debut, fin } = getMonth(new Date(year, month - 1, 1));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let colQuery: any = supabase.from('collaborateurs').select('id, nom, prenom, rayon_id, rayons(nom)').eq('actif', true).order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      colQuery = colQuery.eq('rayon_id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      const { data: rays } = await supabase.from('rayons').select('id').eq('departement_id', profile.departement_id);
      colQuery = colQuery.in('rayon_id', (rays ?? []).map((r: { id: string }) => r.id));
    } else if (filterDep) {
      const { data: rays } = await supabase.from('rayons').select('id').eq('departement_id', filterDep);
      colQuery = colQuery.in('rayon_id', (rays ?? []).map((r: { id: string }) => r.id));
    }
    const { data: cols } = await colQuery;
    if (!cols?.length) { setMoisData([]); return; }

    const { data: lignes } = await supabase
      .from('planning_lignes').select('collaborateur_id, poste, jour')
      .gte('jour', formatDate(debut)).lte('jour', formatDate(fin));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: MoisLigne[] = (cols as any[]).map(c => {
      const cLignes = (lignes ?? []).filter((l: { collaborateur_id: string }) => l.collaborateur_id === c.id);
      const travail = cLignes.filter((l: { poste: string }) => ['M', 'T', 'S'].includes(l.poste)).length;
      const repos = cLignes.filter((l: { poste: string }) => l.poste === 'R').length;
      const conge = cLignes.filter((l: { poste: string }) => l.poste === 'C').length;
      return {
        nom: c.nom,
        prenom: c.prenom,
        rayonNom: c.rayons?.nom ?? '—',
        travail,
        repos,
        conge,
        total: cLignes.length,
      };
    });
    setMoisData(result);
  }

  function exportJournalierPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageW = 210;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT JOURNALIER — MARJANE TANGER', margin, 10);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(formatDisplayLong(new Date(date)), margin, 17);

    let y = 28;
    const total = journalierData.reduce((acc, r) => acc + r.collaborateurs.length, 0);
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`Total présents : ${total} collaborateur(s)`, margin, y);
    y += 8;

    for (const rayon of journalierData) {
      if (y > 260) { doc.addPage(); y = 20; }
      doc.setFillColor(240, 242, 255);
      doc.rect(margin, y, pageW - margin * 2, 7, 'F');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(37, 99, 235);
      doc.text(rayon.rayonNom, margin + 2, y + 5);
      doc.setTextColor(100, 100, 100);
      doc.text(`${rayon.collaborateurs.length} présent(s)`, pageW - margin - 2, y + 5, { align: 'right' });
      y += 7;

      for (const c of rayon.collaborateurs) {
        if (y > 270) { doc.addPage(); y = 20; }
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(8);
        doc.text(`${c.nom} ${c.prenom}`, margin + 4, y + 4);
        doc.setTextColor(80, 80, 80);
        doc.text(POSTE_LABEL[c.poste], pageW - margin - 2, y + 4, { align: 'right' });
        y += 7;
      }
      y += 2;
    }

    doc.save(`rapport_journalier_${date}.pdf`);
  }

  function exportHebdoPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297;
    const margin = 14;
    const nameColW = 42;
    const colW = (pageW - margin * 2 - nameColW) / 7;
    let firstPage = true;

    for (const rayon of hebdoData) {
      if (!rayon.collaborateurs.length) continue;
      if (!firstPage) doc.addPage();
      firstPage = false;

      doc.setFillColor(37, 99, 235);
      doc.rect(0, 0, pageW, 22, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text(`RAPPORT HEBDOMADAIRE — ${rayon.rayonNom}`, margin, 10);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(`${rayon.depNom}  |  Semaine du ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`, margin, 17);

      let y = 26;
      const headerH = 8;
      doc.setFillColor(240, 242, 255);
      doc.rect(margin, y, nameColW, headerH, 'F');
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text('Collaborateur', margin + 2, y + 5.5);
      jours.forEach((j, i) => {
        const x = margin + nameColW + i * colW;
        doc.setFillColor(240, 242, 255);
        doc.rect(x, y, colW, headerH, 'F');
        doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 5.5, { align: 'center' });
      });
      y += headerH;

      const rowH = 9;
      rayon.collaborateurs.forEach((c, idx) => {
        const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
        doc.setFillColor(...bg);
        doc.rect(margin, y, pageW - margin * 2, rowH, 'F');
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(7.5);
        doc.setFont('helvetica', 'bold');
        doc.text(`${c.nom} ${c.prenom}`, margin + 2, y + 5.5);
        c.postes.forEach((p, i) => {
          const x = margin + nameColW + i * colW;
          doc.setFontSize(8);
          doc.text(p, x + colW / 2, y + 5.5, { align: 'center' });
        });
        y += rowH;
      });

      doc.setDrawColor(210, 210, 210);
      doc.rect(margin, 26, pageW - margin * 2, y - 26);
    }

    doc.save(`rapport_hebdomadaire_${formatDate(semaine)}.pdf`);
  }

  function exportMensuelExcel() {
    const [year, month] = mois.split('-').map(Number);
    const nomMois = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const headers = ['Nom', 'Prénom', 'Rayon', 'Jours Travaillés', 'Jours Repos', 'Jours Congé', 'Total Planifié'];
    const rows = moisData.map(c => [c.nom, c.prenom, c.rayonNom, c.travail, c.repos, c.conge, c.total]);
    const wsData = [
      [`RAPPORT MENSUEL — MARJANE TANGER — ${nomMois.toUpperCase()}`],
      [],
      headers,
      ...rows,
      [],
      ['TOTAL', '', '', moisData.reduce((a, c) => a + c.travail, 0), moisData.reduce((a, c) => a + c.repos, 0), moisData.reduce((a, c) => a + c.conge, 0), ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rapport Mensuel');
    XLSX.writeFile(wb, `rapport_mensuel_${mois}.xlsx`);
  }

  function exportMensuelPDF() {
    const [year, month] = mois.split('-').map(Number);
    const nomMois = new Date(year, month - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageW = 210;

    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 22, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.text('RAPPORT MENSUEL — MARJANE TANGER', margin, 10);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(nomMois.charAt(0).toUpperCase() + nomMois.slice(1), margin, 17);

    let y = 28;
    const colWidths = [45, 30, 22, 22, 22, 22];
    const headers = ['Collaborateur', 'Rayon', 'Travail', 'Repos', 'Congé', 'Total'];
    doc.setFillColor(240, 242, 255);
    doc.rect(margin, y, pageW - margin * 2, 8, 'F');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    let x = margin;
    headers.forEach((h, i) => {
      doc.text(h, x + 2, y + 5.5);
      x += colWidths[i];
    });
    y += 8;

    moisData.forEach((c, idx) => {
      if (y > 275) { doc.addPage(); y = 20; }
      const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
      doc.setFillColor(...bg);
      doc.rect(margin, y, pageW - margin * 2, 7, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'normal');
      x = margin;
      const vals = [`${c.nom} ${c.prenom}`, c.rayonNom, `${c.travail}j`, `${c.repos}j`, `${c.conge}j`, `${c.total}j`];
      vals.forEach((v, i) => {
        doc.text(String(v), x + 2, y + 5);
        x += colWidths[i];
      });
      y += 7;
    });

    doc.save(`rapport_mensuel_${mois}.pdf`);
  }

  const tabs = [
    { id: 'journalier', label: 'Journalier', icon: Sun },
    { id: 'hebdomadaire', label: 'Hebdomadaire', icon: Calendar },
    { id: 'mensuel', label: 'Mensuel', icon: BarChart3 },
  ] as const;

  return (
    <div className="space-y-4">

      <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-gray-100 w-fit">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition ${
                activeTab === t.id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        {activeTab === 'journalier' && (
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}
        {activeTab === 'hebdomadaire' && (
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
            <button onClick={() => setSemaine(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return getLundi(n); })} className="p-1 hover:bg-gray-100 rounded-lg">◀</button>
            <span className="text-sm font-medium w-36 text-center">{formatDisplay(semaine)} – {formatDisplay(addDays(semaine, 6))}</span>
            <button onClick={() => setSemaine(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return getLundi(n); })} className="p-1 hover:bg-gray-100 rounded-lg">▶</button>
          </div>
        )}
        {activeTab === 'mensuel' && (
          <input type="month" value={mois} onChange={e => setMois(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        )}
        {isAdmin && (
          <select value={filterDep} onChange={e => setFilterDep(e.target.value)}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Tous les départements</option>
            {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
          </select>
        )}
        {activeTab === 'journalier' && journalierData.length > 0 && (
          <button onClick={exportJournalierPDF} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
            <Printer className="w-4 h-4" /> PDF
          </button>
        )}
        {activeTab === 'hebdomadaire' && hebdoData.length > 0 && (
          <button onClick={exportHebdoPDF} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
            <Printer className="w-4 h-4" /> PDF
          </button>
        )}
        {activeTab === 'mensuel' && moisData.length > 0 && (
          <>
            <button onClick={exportMensuelPDF} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
              <Printer className="w-4 h-4" /> PDF
            </button>
            <button onClick={exportMensuelExcel} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition">
              <FileText className="w-4 h-4" /> Excel
            </button>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'journalier' && (
            journalierData.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
                Aucun collaborateur présent ce jour ou aucun planning sauvegardé.
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
                    <div className="text-2xl font-bold text-blue-600">{journalierData.reduce((a: number, r: RayonLigne) => a + r.collaborateurs.length, 0)}</div>
                    <div className="text-xs text-gray-500 mt-1">Présents aujourd'hui</div>
                  </div>
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{journalierData.length}</div>
                    <div className="text-xs text-gray-500 mt-1">Rayons concernés</div>
                  </div>
                </div>
                {journalierData.map(rayon => (
                  <div key={rayon.rayonNom} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-blue-50 flex justify-between items-center">
                      <span className="font-semibold text-blue-900 text-sm">{rayon.rayonNom}</span>
                      <span className="text-xs text-blue-600">{rayon.collaborateurs.length} présent(s)</span>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {rayon.collaborateurs.map((c, i) => (
                        <div key={i} className="flex items-center justify-between px-4 py-2.5">
                          <div>
                            <span className="font-medium text-sm">{c.nom}</span>
                            <span className="text-gray-400 text-sm ml-2">{c.prenom}</span>
                          </div>
                          <span className={`text-xs px-2 py-1 rounded-lg font-medium ${POSTE_STYLE[c.poste]}`}>
                            {POSTE_LABEL[c.poste]}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'hebdomadaire' && (
            hebdoData.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
                Aucune donnée pour cette semaine.
              </div>
            ) : (
              <div className="space-y-4">
                {hebdoData.map(rayon => (
                  <div key={rayon.rayonNom} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex justify-between">
                      <span className="font-semibold text-sm">{rayon.rayonNom}</span>
                      <span className="text-xs text-gray-400">{rayon.depNom}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr>
                            <th className="text-left px-4 py-2 text-gray-500 font-medium">Collaborateur</th>
                            {jours.map((j, i) => (
                              <th key={i} className="text-center px-2 py-2 text-gray-500 font-medium">
                                {JOURS[i]}<br /><span className="text-gray-400 font-normal">{formatDisplay(j)}</span>
                              </th>
                            ))}
                            <th className="text-center px-2 py-2 text-gray-500 font-medium">Travail</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rayon.collaborateurs.map((c, i) => {
                            const travail = c.postes.filter(p => ['M', 'T', 'S'].includes(p)).length;
                            return (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium">{c.nom} <span className="text-gray-400 font-normal">{c.prenom}</span></td>
                                {c.postes.map((p, j) => (
                                  <td key={j} className="px-1 py-2 text-center">
                                    <span className={`inline-flex items-center justify-center w-8 h-6 rounded text-xs font-bold ${POSTE_STYLE[p]}`}>{p}</span>
                                  </td>
                                ))}
                                <td className="px-2 py-2 text-center font-bold text-blue-600">{travail}j</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}

          {activeTab === 'mensuel' && (
            moisData.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
                Aucune donnée pour ce mois.
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Collaborateur</th>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Rayon</th>
                        <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Travail</th>
                        <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Repos</th>
                        <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Congé</th>
                        <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {moisData.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm">{c.nom}</div>
                            <div className="text-xs text-gray-400">{c.prenom}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{c.rayonNom}</td>
                          <td className="px-3 py-3 text-center font-bold text-blue-600">{c.travail}j</td>
                          <td className="px-3 py-3 text-center text-gray-400 text-xs">{c.repos}j</td>
                          <td className="px-3 py-3 text-center text-emerald-600 text-xs">{c.conge}j</td>
                          <td className="px-3 py-3 text-center text-gray-500 text-xs">{c.total}j</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-100">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 font-semibold text-sm">TOTAL</td>
                        <td className="px-3 py-3 text-center font-bold text-blue-600">{moisData.reduce((a: number, c: MoisLigne) => a + c.travail, 0)}j</td>
                        <td className="px-3 py-3 text-center text-gray-400 text-xs">{moisData.reduce((a: number, c: MoisLigne) => a + c.repos, 0)}j</td>
                        <td className="px-3 py-3 text-center text-emerald-600 text-xs">{moisData.reduce((a: number, c: MoisLigne) => a + c.conge, 0)}j</td>
                        <td className="px-3 py-3 text-center text-gray-500 text-xs">{moisData.reduce((a: number, c: MoisLigne) => a + c.total, 0)}j</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )
          )}
        </>
      )}
    </div>
  );
}
