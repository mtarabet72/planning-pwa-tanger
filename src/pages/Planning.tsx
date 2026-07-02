import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, Plus, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';

type Poste = 'M' | 'AM' | 'N' | 'R' | 'C';

const POSTES: Poste[] = ['M', 'AM', 'N', 'R', 'C'];

const POSTE_STYLE: Record<Poste, string> = {
  M:  'bg-amber-100 text-amber-800 border-amber-300',
  AM: 'bg-blue-100 text-blue-800 border-blue-300',
  N:  'bg-indigo-100 text-indigo-800 border-indigo-300',
  R:  'bg-gray-100 text-gray-500 border-gray-300',
  C:  'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const POSTE_LABEL: Record<Poste, string> = {
  M: 'Matin', AM: 'Après-midi', N: 'Nuit', R: 'Repos', C: 'Congé',
};

const POSTE_FILL: Record<Poste, [number, number, number]> = {
  M:  [254, 243, 199],
  AM: [219, 234, 254],
  N:  [224, 231, 255],
  R:  [243, 244, 246],
  C:  [209, 250, 229],
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

  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [rayons, setRayons] = useState<Rayon[]>([]);
  const [rayonId, setRayonId] = useState<string>('');
  const [rayonNom, setRayonNom] = useState<string>('');
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([]);
  const [grille, setGrille] = useState<Grille>({});
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));

  useEffect(() => { loadRayons(); }, []);
  useEffect(() => { if (rayonId) loadPlanning(); }, [rayonId, semaine]);

  async function loadRayons() {
    let query = supabase.from('rayons').select('*, departements(nom)').order('nom');
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

    const debut = formatDate(semaine);

    const { data: cols } = await supabase
      .from('collaborateurs')
      .select('id, nom, prenom')
      .eq('rayon_id', rayonId)
      .eq('actif', true)
      .order('nom');
    setCollaborateurs((cols as Collaborateur[]) ?? []);

    const { data: plan } = await supabase
      .from('plannings')
      .select('id')
      .eq('rayon_id', rayonId)
      .eq('semaine_debut', debut)
      .single();

    if (plan) {
      setPlanningId(plan.id);
      const { data: lignes } = await supabase
        .from('planning_lignes')
        .select('*')
        .eq('planning_id', plan.id);

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
      const { data } = await supabase
        .from('plannings')
        .upsert(
          { rayon_id: rayonId, semaine_debut: debut, created_by: profile?.id },
          { onConflict: 'rayon_id,semaine_debut' }
        )
        .select('id')
        .single();
      pid = data?.id ?? null;
      setPlanningId(pid);
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

  function handleExportPDF() {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const rayon = rayons.find(r => r.id === rayonId);
    const depNom = rayon?.departements?.nom ?? '';
    const pageW = 297;
    const margin = 14;
    const nameColW = 45;
    const colW = (pageW - margin * 2 - nameColW) / 7;

    // En-tête bleue
    doc.setFillColor(37, 99, 235);
    doc.rect(0, 0, pageW, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(15);
    doc.setFont('helvetica', 'bold');
    doc.text('PLANNING MARJANE TANGER', margin, 11);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `Rayon : ${rayonNom}${depNom ? '  |  Département : ' + depNom : ''}  |  Semaine du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`,
      margin, 19
    );

    // En-tête tableau
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
      doc.setTextColor(50, 50, 50);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text(`${JOURS[i]} ${formatDisplay(j)}`, x + colW / 2, y + 6, { align: 'center' });
    });
    y += headerH;

    // Lignes
    const rowH = 10;
    collaborateurs.forEach((c, idx) => {
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
        const dateStr = formatDate(j);
        const poste: Poste = grille[c.id]?.[dateStr] ?? 'R';
        const x = margin + nameColW + i * colW;
        doc.setFillColor(...POSTE_FILL[poste]);
        doc.rect(x + 1, y + 1, colW - 2, rowH - 2, 'F');
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(poste, x + colW / 2, y + 6.5, { align: 'center' });
      });

      y += rowH;
    });

    // Bordure
    doc.setDrawColor(210, 210, 210);
    doc.rect(margin, 28, pageW - margin * 2, y - 28);

    // Séparateur colonne nom
    doc.line(margin + nameColW, 28, margin + nameColW, y);

    // Séparateurs colonnes jours
    jours.forEach((_, i) => {
      const x = margin + nameColW + i * colW;
      doc.line(x, 28, x, y);
    });

    // Légende
    y += 5;
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text('Légende :  M = Matin   |   AM = Après-midi   |   N = Nuit   |   R = Repos   |   C = Congé', margin, y);

    // Date impression
    doc.setFontSize(7);
    doc.setTextColor(180, 180, 180);
    doc.text(`Imprimé le ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, y, { align: 'right' });

    const fileName = `planning_${rayonNom.toLowerCase().replace(/\s+/g, '_')}_${formatDate(semaine)}.pdf`;
    doc.save(fileName);
  }

  const semaineLabel = `${formatDisplay(semaine)} – ${formatDisplay(addDays(semaine, 6))}`;

  return (
    <div className="space-y-4">

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {(isAdmin || isChefDep) && rayons.length > 1 && (
          <select
            value={rayonId}
            onChange={e => {
              setRayonId(e.target.value);
              const r = rayons.find(r => r.id === e.target.value);
              setRayonNom(r?.nom ?? '');
            }}
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
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition"
            >
              <Printer className="w-4 h-4" />
              PDF
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {POSTES.map(p => (
          <span key={p} className={`text-xs px-2 py-1 rounded-lg border font-medium ${POSTE_STYLE[p]}`}>
            {p} = {POSTE_LABEL[p]}
          </span>
        ))}
        <span className="text-xs text-gray-400 self-center ml-2">Appuie sur une cellule pour changer</span>
      </div>

      {!rayonId && (
        <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
          <Plus className="w-8 h-8 mx-auto mb-3 opacity-30" />
          Sélectionne un rayon pour afficher ou créer le planning.
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

      {rayonId && !loading && collaborateurs.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
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
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {collaborateurs.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <div className="font-medium">{c.nom}</div>
                      <div className="text-gray-400">{c.prenom}</div>
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
