import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, Plus, Printer } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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

const POSTE_COLOR: Record<Poste, [number, number, number]> = {
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
  return date.toISOString().split('T')[0];
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
    const semaineStr = `Semaine du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`;

    // En-tête
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PLANNING MARJANE TANGER', 14, 18);

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Rayon : ${rayonNom}${depNom ? ` — Département : ${depNom}` : ''}`, 14, 26);
    doc.text(semaineStr, 14, 32);

    // En-têtes colonnes
    const headers = [
      ['Collaborateur', ...jours.map((j, i) => `${JOURS[i]}\n${formatDisplay(j)}`)]
    ];

    // Lignes
    const body = collaborateurs.map(c => {
      return [
        `${c.nom}\n${c.prenom}`,
        ...jours.map(j => {
          const dateStr = formatDate(j);
          return grille[c.id]?.[dateStr] ?? 'R';
        }),
      ];
    });

    autoTable(doc, {
      head: headers,
      body,
      startY: 38,
      styles: {
        fontSize: 9,
        cellPadding: 3,
        halign: 'center',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [37, 99, 235],
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
      },
      columnStyles: {
        0: { halign: 'left', cellWidth: 40 },
      },
      didParseCell(data) {
        if (data.section === 'body' && data.column.index > 0) {
          const poste = data.cell.raw as Poste;
          if (POSTE_COLOR[poste]) {
            data.cell.styles.fillColor = POSTE_COLOR[poste];
          }
          if (poste === 'R') data.cell.styles.textColor = [156, 163, 175];
          else data.cell.styles.textColor = [30, 30, 30];
          data.cell.styles.fontStyle = 'bold';
        }
      },
      foot: [[
        { content: 'Légende : M = Matin  |  AM = Après-midi  |  N = Nuit  |  R = Repos  |  C = Congé', colSpan: 8, styles: { halign: 'left', fontSize: 8, textColor: [100, 100, 100] } }
      ]],
    });

    const fileName = `planning_${rayonNom.toLowerCase().replace(/\s+/g, '_')}_${formatDate(semaine)}.pdf`;
    doc.save(fileName);
  }

  const semaineLabel = `${formatDisplay(semaine)} – ${formatDisplay(addDays(semaine, 6))}`;

  return (
    <div className="space-y-4">

      {/* Contrôles */}
      <div className="flex flex-col sm:flex-row gap-3">
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
              className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
            </button>
            <button
              onClick={handleExportPDF}
              className="flex items-center justify-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition"
            >
              <Printer className="w-4 h-4" />
              PDF
            </button>
          </div>
        )}
      </div>

      {/* Légende */}
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

      {/* Grille planning */}
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
