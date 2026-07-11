import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Printer, FileText, LayoutGrid } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';

type Poste = 'M' | 'T' | 'S' | 'R' | 'C' | 'HN' | 'MAL' | 'AT' | 'FOR';

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

const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M: [254, 243, 199], T: [219, 234, 254], S: [224, 231, 255], R: [243, 244, 246], C: [209, 250, 229],
  HN: [204, 251, 241], MAL: [255, 228, 230], AT: [254, 226, 226], FOR: [237, 233, 254],
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
}

interface RayonData {
  id: string;
  nom: string;
  numero: string | null;
  depNom: string;
  collaborateurs: Collaborateur[];
  grille: Record<string, Record<string, Poste>>;
  hasPlanning: boolean;
}

interface EncadrementCollaborateur extends Collaborateur {
  fonction: string;
  rayonNom: string;
}

interface EncadrementData {
  departementId: string;
  depNom: string;
  collaborateurs: EncadrementCollaborateur[];
  grille: Record<string, Record<string, Poste>>;
  hasPlanning: boolean;
}

interface PermanenceCollaborateur extends Collaborateur {
  rayonNom: string;
}

interface PermanenceData {
  membres: PermanenceCollaborateur[];
  grille: Record<string, Record<string, Poste>>;
  hasPlanning: boolean;
}

const FONCTION_LABEL: Record<string, string> = { chef_rayon: 'Chef de Rayon', assistante: 'Assistante' };

export default function Consolidation() {
  const { profile } = useAuth();
  const isAdmin = canAccessAdmin(profile?.role ?? 'chef_rayon');

  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [rayonsData, setRayonsData] = useState<RayonData[]>([]);
  const [encadrementData, setEncadrementData] = useState<EncadrementData[]>([]);
  const [permanenceData, setPermanenceData] = useState<PermanenceData>({ membres: [], grille: {}, hasPlanning: false });
  const [activeRayon, setActiveRayon] = useState<string>('');
  const [activeDep, setActiveDep] = useState<string>('');
  const [depNomGlobal, setDepNomGlobal] = useState<string>('');

  const [loading, setLoading] = useState(false);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const numSemaine = getNumeroSemaine(semaine);

  useEffect(() => { loadAll(); }, [semaine]);

  async function loadAll() {
    setLoading(true);

    if (profile?.departement_id) {
      const { data: dep } = await supabase
        .from('departements').select('nom').eq('id', profile.departement_id).single();
      setDepNomGlobal(dep?.nom ?? '');
    } else if (isAdmin) {
      setDepNomGlobal('Tous les départements');
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rayQuery: any = supabase.from('rayons').select('id, nom, numero, departement_id, departements(nom)').eq('actif', true).order('nom');
    if (profile?.role === 'chef_departement' && profile.departement_id) {
      rayQuery = rayQuery.eq('departement_id', profile.departement_id);
    }
    const { data: rayons } = await rayQuery;
    if (!rayons?.length) { setRayonsData([]); setLoading(false); return; }

    const debut = formatDate(semaine);
    const result: RayonData[] = [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const rayon of rayons as any[]) {
      const { data: cols } = await supabase
        .from('collaborateurs').select('id, nom, prenom')
        .eq('rayon_id', rayon.id).eq('actif', true)
        .neq('fonction', 'chef_rayon').order('nom');

      const { data: plan } = await supabase
        .from('plannings').select('id')
        .eq('rayon_id', rayon.id).eq('semaine_debut', debut).single();

      const grille: Record<string, Record<string, Poste>> = {};

      if (plan) {
        const { data: lignes } = await supabase
          .from('planning_lignes').select('*').eq('planning_id', plan.id);
        for (const l of lignes ?? []) {
          if (!grille[l.collaborateur_id]) grille[l.collaborateur_id] = {};
          grille[l.collaborateur_id][l.jour] = l.poste as Poste;
        }
      } else {
        for (const c of cols ?? []) {
          grille[c.id] = {};
          for (const j of jours) grille[c.id][formatDate(j)] = 'R';
        }
      }

      result.push({
        id: rayon.id,
        nom: rayon.nom,
        numero: rayon.numero,
        depNom: rayon.departements?.nom ?? '—',
        collaborateurs: (cols as Collaborateur[]) ?? [],
        grille,
        hasPlanning: !!plan,
      });
    }

    setRayonsData(result);
    if (result.length > 0 && (!activeRayon || !result.find(r => r.id === activeRayon))) {
      setActiveRayon(result[0].id);
      setActiveDep(result[0].depNom);
    }

    // ---- Encadrement (Chefs de Rayon / Assistantes), par département ----
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const depIds = Array.from(new Set((rayons as any[]).map(r => r.departement_id as string)));
    const encResult: EncadrementData[] = [];
    for (const depId of depIds) {
      const { data: depRow } = await supabase.from('departements').select('nom').eq('id', depId).single();
      const { data: encCols } = await supabase
        .from('collaborateurs').select('id, nom, prenom, fonction, rayons(nom)')
        .eq('departement_id', depId).eq('actif', true)
        .in('fonction', ['chef_rayon', 'assistante']).order('fonction').order('nom');

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const encColsList: EncadrementCollaborateur[] = ((encCols ?? []) as any[]).map(c => ({
        id: c.id, nom: c.nom, prenom: c.prenom, fonction: c.fonction, rayonNom: c.rayons?.nom ?? '—',
      }));

      const { data: encPlan } = await supabase
        .from('plannings_encadrement').select('id').eq('departement_id', depId).eq('semaine_debut', debut).single();

      const encGrille: Record<string, Record<string, Poste>> = {};
      if (encPlan) {
        const { data: encLignes } = await supabase
          .from('planning_encadrement_lignes').select('*').eq('planning_id', encPlan.id);
        for (const l of encLignes ?? []) {
          if (!encGrille[l.collaborateur_id]) encGrille[l.collaborateur_id] = {};
          encGrille[l.collaborateur_id][l.jour] = l.poste as Poste;
        }
      } else {
        for (const c of encColsList) {
          encGrille[c.id] = {};
          for (const j of jours) encGrille[c.id][formatDate(j)] = 'R';
        }
      }

      if (encColsList.length) {
        encResult.push({
          departementId: depId,
          depNom: depRow?.nom ?? '—',
          collaborateurs: encColsList,
          grille: encGrille,
          hasPlanning: !!encPlan,
        });
      }
    }
    setEncadrementData(encResult);

    // ---- Permanence (magasin, non scopée par département) ----
    const { data: permPlan } = await supabase
      .from('plannings_permanence').select('id').eq('type', 'permanence').eq('semaine_debut', debut).single();

    let permMembresList: PermanenceCollaborateur[] = [];
    const permGrilleObj: Record<string, Record<string, Poste>> = {};
    if (permPlan) {
      const { data: membresRaw } = await supabase
        .from('permanence_membres').select('collaborateur_id, collaborateurs(nom, prenom, rayons(nom))')
        .eq('planning_id', permPlan.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      permMembresList = ((membresRaw ?? []) as any[]).map(m => ({
        id: m.collaborateur_id, nom: m.collaborateurs?.nom ?? '', prenom: m.collaborateurs?.prenom ?? '',
        rayonNom: m.collaborateurs?.rayons?.nom ?? '—',
      }));
      const { data: permLignes } = await supabase
        .from('permanence_lignes').select('*').eq('planning_id', permPlan.id);
      for (const l of permLignes ?? []) {
        if (!permGrilleObj[l.collaborateur_id]) permGrilleObj[l.collaborateur_id] = {};
        permGrilleObj[l.collaborateur_id][l.jour] = l.poste as Poste;
      }
    }
    setPermanenceData({ membres: permMembresList, grille: permGrilleObj, hasPlanning: !!permPlan });

    setLoading(false);
  }

  function handleExportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageW = 297;
    const margin = 14;
    const nameColW = 42;
    const colW = (pageW - margin * 2 - nameColW) / 7;
    let pageStarted = false;

    function drawPage(
      title: string,
      subtitle: string,
      headerColor: [number, number, number],
      headBg: [number, number, number],
      rows: { id: string; nom: string; prenom: string; sub?: string }[],
      grille: Record<string, Record<string, Poste>>,
    ) {
      if (pageStarted) doc.addPage();
      pageStarted = true;

      doc.setFillColor(...headerColor);
      doc.rect(0, 0, pageW, 24, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, 11);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(subtitle, margin, 19);

      let y = 28;
      const headerH = 9;

      doc.setFillColor(...headBg);
      doc.rect(margin, y, nameColW, headerH, 'F');
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.text('Collaborateur', margin + 2, y + 6);

      jours.forEach((j, i) => {
        const x = margin + nameColW + i * colW;
        doc.setFillColor(...headBg);
        doc.rect(x, y, colW, headerH, 'F');
        doc.setFontSize(7.5);
        doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 6, { align: 'center' });
      });
      y += headerH;

      const rowH = 10;
      rows.forEach((c, idx) => {
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
        doc.text(`${c.prenom}${c.sub ? ' — ' + c.sub : ''}`, margin + 2, y + 8.5);

        jours.forEach((j, i) => {
          const poste: Poste = grille[c.id]?.[formatDate(j)] ?? 'R';
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
      jours.forEach((_, i) => {
        doc.line(margin + nameColW + i * colW, 28, margin + nameColW + i * colW, y);
      });

      y += 5;
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 100, 100);
      doc.text('M=Matin  T=Tranche  S=Soir  R=Repos  C=Congé  HN=Horaire Normal  MAL=Maladie  AT=Accident Travail  FOR=Formation', margin, y);
      doc.setTextColor(180, 180, 180);
      doc.text(`Imprimé le ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, y, { align: 'right' });
    }

    const periode = `S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`;

    // ---- 1. Plannings des employés (par rayon) ----
    for (const rayon of rayonsData) {
      if (!rayon.collaborateurs.length) continue;
      drawPage(
        `PLANNING EMPLOYÉS — ${rayon.numero ? '[' + rayon.numero + '] ' : ''}${rayon.nom}`,
        `Département : ${rayon.depNom}  |  ${periode}${!rayon.hasPlanning ? '  |  ⚠ Aucun planning sauvegardé' : ''}`,
        [37, 99, 235], [240, 242, 255],
        rayon.collaborateurs.map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom })),
        rayon.grille,
      );
    }

    // ---- 2. Plannings d'encadrement (Chefs de Rayon / Assistantes), par département ----
    for (const enc of encadrementData) {
      if (!enc.collaborateurs.length) continue;
      drawPage(
        `PLANNING ENCADREMENT — ${enc.depNom}`,
        `Chefs de Rayon & Assistantes  |  ${periode}${!enc.hasPlanning ? '  |  ⚠ Aucun planning sauvegardé' : ''}`,
        [124, 58, 237], [243, 232, 255],
        enc.collaborateurs.map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, sub: `${FONCTION_LABEL[c.fonction] ?? c.fonction} — ${c.rayonNom}` })),
        enc.grille,
      );
    }

    // ---- 3. Planning de permanence (magasin) ----
    if (permanenceData.membres.length) {
      drawPage(
        'PLANNING DE PERMANENCE — Magasin',
        `Responsables de garde  |  ${periode}${!permanenceData.hasPlanning ? '  |  ⚠ Aucun planning sauvegardé' : ''}`,
        [217, 119, 6], [255, 243, 224],
        permanenceData.membres.map(c => ({ id: c.id, nom: c.nom, prenom: c.prenom, sub: c.rayonNom })),
        permanenceData.grille,
      );
    }

    doc.save(`consolidation_${depNomGlobal.toLowerCase().replace(/\s+/g, '_')}_S${numSemaine}_${formatDate(semaine)}.pdf`);
  }

  function handleExportExcel() {
    const wb = XLSX.utils.book_new();
    const commonCols = () => [{ wch: 18 }, { wch: 14 }, ...jours.map(() => ({ wch: 10 })), { wch: 10 }, { wch: 12 }, { wch: 10 }];
    const stats = (postes: Poste[]) => ({
      travail: postes.filter(p => ['M', 'T', 'S', 'HN'].includes(p)).length,
      repos: postes.filter(p => ['R', 'C'].includes(p)).length,
      absences: postes.filter(p => ['MAL', 'AT', 'FOR'].includes(p)).length,
    });

    // ---- 1. Plannings des employés (par rayon) ----
    for (const rayon of rayonsData) {
      if (!rayon.collaborateurs.length) continue;

      const headers = [
        'Collaborateur', 'Prénom',
        ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`),
        'Travail', 'Repos/Congé', 'Absences',
      ];

      const rows = rayon.collaborateurs.map(c => {
        const postes = jours.map(j => rayon.grille[c.id]?.[formatDate(j)] ?? 'R');
        const { travail, repos, absences } = stats(postes);
        return [c.nom, c.prenom, ...postes, travail, repos, absences];
      });

      const wsData = [
        [`PLANNING ${rayon.nom} — ${rayon.depNom} — S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
        [], headers, ...rows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = commonCols();
      XLSX.utils.book_append_sheet(wb, ws, rayon.nom.substring(0, 31));
    }

    // ---- 2. Plannings d'encadrement (Chefs de Rayon / Assistantes), par département ----
    for (const enc of encadrementData) {
      if (!enc.collaborateurs.length) continue;

      const headers = [
        'Collaborateur', 'Prénom', 'Fonction', 'Rayon',
        ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`),
        'Travail', 'Repos/Congé', 'Absences',
      ];

      const rows = enc.collaborateurs.map(c => {
        const postes = jours.map(j => enc.grille[c.id]?.[formatDate(j)] ?? 'R');
        const { travail, repos, absences } = stats(postes);
        return [c.nom, c.prenom, FONCTION_LABEL[c.fonction] ?? c.fonction, c.rayonNom, ...postes, travail, repos, absences];
      });

      const wsData = [
        [`PLANNING ENCADREMENT — ${enc.depNom} — S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
        [], headers, ...rows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, { wch: 16 }, ...jours.map(() => ({ wch: 10 })), { wch: 10 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, `Enc. ${enc.depNom}`.substring(0, 31));
    }

    // ---- 3. Planning de permanence (magasin) ----
    if (permanenceData.membres.length) {
      const headers = [
        'Collaborateur', 'Prénom', 'Rayon',
        ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`),
        'Travail', 'Repos/Congé', 'Absences',
      ];

      const rows = permanenceData.membres.map(c => {
        const postes = jours.map(j => permanenceData.grille[c.id]?.[formatDate(j)] ?? 'R');
        const { travail, repos, absences } = stats(postes);
        return [c.nom, c.prenom, c.rayonNom, ...postes, travail, repos, absences];
      });

      const wsData = [
        [`PLANNING DE PERMANENCE — Magasin — S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
        [], headers, ...rows,
      ];

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 16 }, ...jours.map(() => ({ wch: 10 })), { wch: 10 }, { wch: 12 }, { wch: 10 }];
      XLSX.utils.book_append_sheet(wb, ws, 'Permanence');
    }

    XLSX.writeFile(wb, `consolidation_${depNomGlobal.toLowerCase().replace(/\s+/g, '_')}_S${numSemaine}_${formatDate(semaine)}.xlsx`);
  }

  const activeData = rayonsData.find(r => r.id === activeRayon);
  const semaineLabel = `S${numSemaine} — ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`;

  const grouped: Record<string, RayonData[]> = {};
  for (const r of rayonsData) {
    if (!grouped[r.depNom]) grouped[r.depNom] = [];
    grouped[r.depNom].push(r);
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

        {rayonsData.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition"
            >
              <Printer className="w-4 h-4" />
              PDF Complet
            </button>
            <button
              onClick={handleExportExcel}
              className="flex items-center gap-2 bg-green-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-green-700 transition"
            >
              <FileText className="w-4 h-4" />
              Excel Complet
            </button>
          </div>
        )}
      </div>

      {rayonsData.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
            <div className="text-2xl font-bold text-blue-600">{rayonsData.length}</div>
            <div className="text-xs text-gray-500 mt-1">Rayons</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
            <div className="text-2xl font-bold text-emerald-600">
              {rayonsData.filter(r => r.hasPlanning).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Planifiés</div>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
            <div className="text-2xl font-bold text-amber-600">
              {rayonsData.filter(r => !r.hasPlanning).length}
            </div>
            <div className="text-xs text-gray-500 mt-1">Non planifiés</div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : rayonsData.length === 0 ? (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          <LayoutGrid className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Aucun rayon trouvé sur ce périmètre.
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {Object.entries(grouped).map(([depNom, depRayons]) => (
              <div key={depNom}>
                <p className="text-xs font-semibold text-gray-400 uppercase mb-1.5 px-1">{depNom}</p>
                <div className="flex gap-2 flex-wrap">
                  {depRayons.map(r => (
                    <button
                      key={r.id}
                      onClick={() => { setActiveRayon(r.id); setActiveDep(depNom); }}
                      className={`px-4 py-2 rounded-xl text-sm font-medium transition flex items-center gap-2 ${
                        activeRayon === r.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-300'
                      }`}
                    >
                      {r.numero && <span className="text-xs opacity-70">[{r.numero}]</span>}
                      {r.nom}
                      {!r.hasPlanning && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Pas de planning" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {activeData && (
            <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                <div>
                  <span className="font-semibold text-gray-900">
                    {activeData.numero && <span className="text-gray-400 mr-1">[{activeData.numero}]</span>}
                    {activeData.nom}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">{activeDep}</span>
                  {!activeData.hasPlanning && (
                    <span className="ml-2 text-xs bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">
                      Aucun planning sauvegardé
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-400">{activeData.collaborateurs.length} collaborateur(s)</span>
              </div>

              {activeData.collaborateurs.length === 0 ? (
                <div className="p-8 text-center text-gray-400 text-sm">
                  Aucun collaborateur actif dans ce rayon.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium text-gray-500 min-w-32">Collaborateur</th>
                        {jours.map((j, i) => (
                          <th key={i} className="text-center px-2 py-3 font-medium text-gray-500 min-w-12">
                            <div>{JOURS[i]}</div>
                            <div className="text-gray-400 font-normal">{formatDisplay(j)}</div>
                          </th>
                        ))}
                        <th className="text-center px-2 py-3 font-medium text-gray-500 min-w-12">Travail</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {activeData.collaborateurs.map(c => {
                        const postes = jours.map(j => activeData.grille[c.id]?.[formatDate(j)] ?? 'R');
                        const travail = postes.filter(p => ['M', 'T', 'S', 'HN'].includes(p)).length;
                        return (
                          <tr key={c.id} className="hover:bg-gray-50">
                            <td className="px-4 py-2">
                              <div className="font-medium">{c.nom}</div>
                              <div className="text-gray-400">{c.prenom}</div>
                            </td>
                            {jours.map((j, i) => {
                              const poste: Poste = activeData.grille[c.id]?.[formatDate(j)] ?? 'R';
                              return (
                                <td key={i} className="px-1 py-2 text-center">
                                  <span className={`inline-flex items-center justify-center w-10 h-8 rounded-lg border font-bold ${
                                    poste.length > 1 ? 'text-[9px]' : 'text-xs'
                                  } ${POSTE_STYLE[poste]}`}>
                                    {poste}
                                  </span>
                                </td>
                              );
                            })}
                            <td className="px-2 py-2 text-center font-bold text-blue-600">{travail}j</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
