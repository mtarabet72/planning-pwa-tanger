import { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Save, Loader2, Printer, FileText, Users2, X, Send } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { purgerLignesOrphelines } from '../lib/planningLignes';
import { useAuth } from '../context/AuthContext';
import { useAssistant } from '../context/AssistantContext';
import { useToast } from '../context/ToastContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { getLundi, addDays, formatDate, formatDisplay, formatDisplayLong, getNumeroSemaine, JOURS } from '../lib/dates';
import { type Poste, POSTES_CYCLE, POSTES_SPECIAUX, POSTES_TOUS, POSTE_STYLE, POSTE_LABEL, POSTE_FILL } from '../lib/postes';
import { detecterAnomalies } from '../lib/anomalies';

type Fonction = 'employe' | 'chef_rayon' | 'assistante' | 'chef_departement';
type StatutEnc = 'brouillon' | 'soumis' | 'valide' | 'rejete';

const FONCTION_LABEL: Record<Fonction, string> = {
  employe: 'Employé', chef_rayon: 'Chef de Rayon', assistante: 'Assistante', chef_departement: 'Chef de Département',
};

const FONCTION_STYLE: Record<Fonction, string> = {
  employe: 'bg-gray-100 text-gray-600',
  chef_rayon: 'bg-purple-50 text-purple-700',
  assistante: 'bg-blue-50 text-blue-700',
  chef_departement: 'bg-amber-50 text-amber-700',
};

const LONG_PRESS_MS = 500;

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
  const { runCheck } = useAssistant();
  const { toast, confirmDialog } = useToast();
  const isAdmin = profile ? canAccessAdmin(profile.role) : false;
  const isChefDep = profile?.role === 'chef_departement';

  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [depNom, setDepNom] = useState('');
  const [departementId, setDepartementId] = useState('');
  const [departementsOptions, setDepartementsOptions] = useState<{ id: string; nom: string }[]>([]);
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([]);
  const [grille, setGrille] = useState<Grille>({});
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [planningStatut, setPlanningStatut] = useState<StatutEnc>('brouillon');
  const [planningCommentaire, setPlanningCommentaire] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [posteMenu, setPosteMenu] = useState<{ colId: string; jour: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const numSemaine = getNumeroSemaine(semaine);
  // Une fois soumis à l'admin ou validé, le planning n'est plus modifiable ici
  const readOnly = planningStatut === 'soumis' || planningStatut === 'valide';

  useEffect(() => { init(); }, []);
  useEffect(() => { if (departementId) loadPlanning(); }, [departementId, semaine]);

  async function init() {
    if (isChefDep && (profile?.departement_ids?.length ?? 0) > 0) {
      const { data: deps } = await supabase
        .from('departements').select('id, nom').in('id', profile!.departement_ids).order('nom');
      const list = deps ?? [];
      setDepartementsOptions(list);
      if (list.length > 0) {
        setDepartementId(list[0].id);
        setDepNom(list[0].nom);
      }
    } else if (isAdmin) {
      const { data: deps } = await supabase.from('departements').select('id, nom').order('nom');
      setDepartementsOptions(deps ?? []);
    }
  }

  function handleChangeDepartement(id: string) {
    setDepartementId(id);
    setDepNom(departementsOptions.find(d => d.id === id)?.nom ?? '');
  }

  async function loadPlanning() {
    setLoading(true);
    setGrille({});
    setPlanningId(null);
    setPlanningStatut('brouillon');
    setPlanningCommentaire(null);

    const { data: cols } = await supabase
      .from('collaborateurs')
      .select('id, nom, prenom, fonction, rayons(nom)')
      .eq('departement_id', departementId)
      .eq('actif', true)
      .in('fonction', ['chef_rayon', 'assistante'])
      .order('fonction')
      .order('nom');

    // Cf. Departements.tsx : `rayons` est déduit comme un tableau par le générateur de types,
    // alors que PostgREST renvoie un objet unique pour cette relation many-to-one.
    const colsList: Collaborateur[] = ((cols ?? []) as unknown as { id: string; nom: string; prenom: string; fonction: Fonction; rayons: { nom: string } | null }[]).map(c => ({
      id: c.id, nom: c.nom, prenom: c.prenom, fonction: c.fonction, rayonNom: c.rayons?.nom ?? '—',
    }));
    setCollaborateurs(colsList);

    const debut = formatDate(semaine);
    const { data: plan } = await supabase
      .from('plannings_encadrement').select('id, statut, commentaire')
      .eq('departement_id', departementId).eq('semaine_debut', debut).single();

    if (plan) {
      setPlanningId(plan.id);
      setPlanningStatut((plan.statut as StatutEnc) ?? 'brouillon');
      setPlanningCommentaire(plan.commentaire ?? null);
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

  function setPoste(colId: string, jour: string, poste: Poste) {
    if (readOnly) return;
    setGrille(prev => ({ ...prev, [colId]: { ...prev[colId], [jour]: poste } }));
    setSaved(false);
  }

  function cyclePoste(colId: string, jour: string) {
    if (readOnly) return;
    setGrille(prev => {
      const current: Poste = prev[colId]?.[jour] ?? 'R';
      const idxInCycle = POSTES_CYCLE.indexOf(current);
      const next = idxInCycle === -1 ? POSTES_CYCLE[0] : POSTES_CYCLE[(idxInCycle + 1) % POSTES_CYCLE.length];
      return { ...prev, [colId]: { ...prev[colId], [jour]: next } };
    });
    setSaved(false);
  }

  function handlePressStart(colId: string, jour: string) {
    if (readOnly) return;
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setPosteMenu({ colId, jour });
    }, LONG_PRESS_MS);
  }

  function handlePressEnd(colId: string, jour: string) {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    if (!longPressTriggered.current) cyclePoste(colId, jour);
  }

  function handlePressCancel() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
  }

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    try {
      const debut = formatDate(semaine);
      let pid = planningId;

      if (!pid) {
        const { data, error: errUpsertPlanning } = await supabase.from('plannings_encadrement')
          .upsert({ departement_id: departementId, semaine_debut: debut, created_by: profile?.id },
            { onConflict: 'departement_id,semaine_debut' })
          .select('id').single();
        if (errUpsertPlanning) throw errUpsertPlanning;
        pid = data?.id ?? null;
        setPlanningId(pid);
        setPlanningStatut('brouillon');
      }

      if (!pid) { setSaving(false); return; }

      // Retire les lignes des collaborateurs absents de la grille avant d'écraser le reste (cf. lib/planningLignes)
      await purgerLignesOrphelines('planning_encadrement_lignes', pid, Object.keys(grille));
      const lignes = [];
      for (const [colId, jmap] of Object.entries(grille)) {
        for (const [jour, poste] of Object.entries(jmap)) {
          lignes.push({ planning_id: pid, collaborateur_id: colId, jour, poste });
        }
      }
      const { error: errUpsertLignes } = await supabase.from('planning_encadrement_lignes')
        .upsert(lignes, { onConflict: 'planning_id,collaborateur_id,jour' });
      if (errUpsertLignes) throw errUpsertLignes;

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void runCheck(semaine);
    } catch (err: any) {
      console.error('[DEBUG planning encadrement] Erreur sauvegarde :', err);
      toast.error(`Erreur lors de la sauvegarde du planning :\n${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }

  /** Soumet le planning d'encadrement à l'administrateur pour validation finale. */
  async function handleSoumettre() {
    if (!planningId || !profile) return;
    setSubmitting(true);
    try {
      // Contrôle frais (seule la règle "double affectation" peut réellement se déclencher ici,
      // les règles de repos/effectif ne portant que sur le planning rayon — cf. lib/anomalies.ts).
      const toutesAnomalies = await detecterAnomalies(profile, semaine);
      const collabIds = new Set(collaborateurs.map(c => c.id));
      const bloquantes = toutesAnomalies.filter(a => a.gravite === 'bloquante' && collabIds.has(a.collaborateurId));
      if (bloquantes.length > 0) {
        const ok = await confirmDialog({
          title: `${bloquantes.length} anomalie${bloquantes.length > 1 ? 's' : ''} bloquante${bloquantes.length > 1 ? 's' : ''} détectée${bloquantes.length > 1 ? 's' : ''}`,
          body: bloquantes.map(a => a.message).join('\n\n') + '\n\nSoumettre quand même ?',
          confirmLabel: 'Soumettre quand même',
          danger: true,
        });
        if (!ok) { setSubmitting(false); return; }
      }

      const { error } = await supabase.from('plannings_encadrement')
        .update({ statut: 'soumis', commentaire: null }).eq('id', planningId);
      if (error) throw error;
      setPlanningStatut('soumis');
      setPlanningCommentaire(null);
    } catch (err: any) {
      console.error('[DEBUG planning encadrement] Erreur soumission :', err);
      toast.error(`Erreur lors de la soumission :\n${err?.message ?? err}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReprendreEnBrouillon() {
    if (!planningId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('plannings_encadrement')
        .update({ statut: 'brouillon', commentaire: null }).eq('id', planningId);
      if (error) throw error;
      setPlanningStatut('brouillon');
      setPlanningCommentaire(null);
    } catch (err: any) {
      console.error('[DEBUG planning encadrement] Erreur reprise :', err);
      toast.error(`Erreur :\n${err?.message ?? err}`);
    } finally {
      setSubmitting(false);
    }
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
        {departementsOptions.length > 1 && (
          <select value={departementId} onChange={e => handleChangeDepartement(e.target.value)}
            className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-purple-400">
            <option value="" disabled>Choisir un département…</option>
            {departementsOptions.map(d => (
              <option key={d.id} value={d.id}>{d.nom}</option>
            ))}
          </select>
        )}

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
            {!readOnly && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-purple-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-60 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? 'Sauvegardé ✓' : 'Sauvegarder'}
              </button>
            )}
            {planningId && planningStatut === 'brouillon' && (
              <button onClick={handleSoumettre} disabled={submitting}
                className="flex items-center gap-2 bg-amber-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Soumettre à l'Admin
              </button>
            )}
            {planningId && planningStatut === 'rejete' && (
              <button onClick={handleReprendreEnBrouillon} disabled={submitting}
                className="flex items-center gap-2 bg-gray-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-600 disabled:opacity-60 transition">
                Reprendre
              </button>
            )}
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

      {planningId && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
            planningStatut === 'brouillon' && planningCommentaire ? 'bg-red-100 text-red-700' :
            planningStatut === 'brouillon' ? 'bg-gray-100 text-gray-600' :
            planningStatut === 'soumis' ? 'bg-amber-100 text-amber-700' :
            planningStatut === 'valide' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {planningStatut === 'brouillon' && planningCommentaire ? "Rejeté par l'Admin — à corriger puis re-soumettre" :
             planningStatut === 'brouillon' ? 'Brouillon' :
             planningStatut === 'soumis' ? "Soumis — en attente de validation de l'Admin" :
             planningStatut === 'valide' ? 'Validé (Final) ✓' : 'Rejeté'}
          </span>
          {planningCommentaire && (
            <span className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
              Motif : {planningCommentaire}
            </span>
          )}
        </div>
      )}

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
                            onMouseDown={() => handlePressStart(c.id, dateStr)}
                            onMouseUp={() => handlePressEnd(c.id, dateStr)}
                            onMouseLeave={handlePressCancel}
                            onTouchStart={() => handlePressStart(c.id, dateStr)}
                            onTouchEnd={() => handlePressEnd(c.id, dateStr)}
                            onTouchCancel={handlePressCancel}
                            onContextMenu={e => e.preventDefault()}
                            disabled={readOnly}
                            className={`w-10 h-8 rounded-lg border font-bold transition select-none ${
                              poste.length > 1 ? 'text-[9px]' : 'text-xs'
                            } ${POSTE_STYLE[poste]} ${readOnly ? 'cursor-default opacity-80' : 'hover:opacity-80'}`}
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
                  onClick={() => { setPoste(posteMenu.colId, posteMenu.jour, p); setPosteMenu(null); }}
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