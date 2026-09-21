import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Save, Loader2, Plus, Printer, FileText, Send, X, Copy } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { purgerLignesOrphelines } from '../lib/planningLignes';
import { useAuth } from '../context/AuthContext';
import { useAssistant } from '../context/AssistantContext';
import { useToast } from '../context/ToastContext';
import { detecterAnomalies } from '../lib/anomalies';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { getLundi, addDays, formatDate, formatDisplay, formatDisplayLong, getNumeroSemaine, parseDateIso, JOURS, JOURS_COURT } from '../lib/dates';
import { type Poste, POSTES_CYCLE, POSTES_SPECIAUX, POSTES_TOUS, POSTE_STYLE, POSTE_LABEL, POSTE_FILL, estTravail, estRepos, estAbsence } from '../lib/postes';

const SEMAINE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

type Statut = 'brouillon' | 'soumis_dept' | 'soumis_admin' | 'valide' | 'rejete';

const LONG_PRESS_MS = 500;

interface Collaborateur {
  id: string;
  nom: string;
  prenom: string;
  fonction?: string;
}

interface Rayon {
  id: string;
  nom: string;
  numero: string | null;
  departement_id: string;
  departements?: { nom: string };
}

type Grille = Record<string, Record<string, Poste>>;

export default function Planning() {
  const { profile } = useAuth();
  const { runCheck } = useAssistant();
  const { toast, confirmDialog } = useToast();
  const isAdmin = profile ? canAccessAdmin(profile.role) : false;
  const isChefDep = profile?.role === 'chef_departement';
  const isChefRayon = profile?.role === 'chef_rayon';

  const [searchParams, setSearchParams] = useSearchParams();
  // Lus une seule fois au montage (liens partageables) — les changements ultérieurs sont
  // réappliqués vers l'URL par l'effet plus bas, pas l'inverse.
  const [rayonParamInitial] = useState(() => searchParams.get('rayon'));
  const [semaineParamInitial] = useState(() => {
    const s = searchParams.get('semaine');
    return s && SEMAINE_ISO_RE.test(s) ? s : null;
  });

  const [semaine, setSemaine] = useState<Date>(() => semaineParamInitial ? getLundi(parseDateIso(semaineParamInitial)) : getLundi(new Date()));
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
  const [copying, setCopying] = useState(false);

  // Menu appui long
  const [posteMenu, setPosteMenu] = useState<{ colId: string; jour: string } | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);

  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));
  const readOnly = planningStatut === 'soumis_dept' || planningStatut === 'soumis_admin' || planningStatut === 'valide';
  const numSemaine = getNumeroSemaine(semaine);

  useEffect(() => { loadRayons(); }, []);
  useEffect(() => { if (rayonId) loadPlanning(); }, [rayonId, semaine]);

  // Garde l'URL synchronisée avec le rayon/la semaine affichés, pour que l'adresse dans la
  // barre du navigateur reste copiable/partageable à tout moment (pas seulement au chargement).
  useEffect(() => {
    if (!rayonId) return;
    setSearchParams({ rayon: rayonId, semaine: formatDate(semaine) }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rayonId, semaine]);

  async function loadRayons() {
    let query = supabase.from('rayons').select('id, nom, numero, departement_id, departements(nom)').order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_ids.length > 0) {
      query = query.in('id', profile.rayon_ids);
    } else if (isChefDep && (profile?.departement_ids?.length ?? 0) > 0) {
      query = query.in('departement_id', profile.departement_ids);
    }
    const { data } = await query;
    const list = (data ?? []) as unknown as Rayon[];
    setRayons(list);
    const depuisUrl = rayonParamInitial ? list.find(r => r.id === rayonParamInitial) : undefined;
    if (depuisUrl) {
      setRayonId(depuisUrl.id);
      setRayonNom(depuisUrl.nom);
    } else if (list.length === 1) {
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
      .from('collaborateurs').select('id, nom, prenom, fonction')
      .eq('rayon_id', rayonId).eq('actif', true)
      .neq('fonction', 'chef_rayon')
      .order('nom');
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

  function setPoste(colId: string, jour: string, poste: Poste) {
    setGrille(prev => ({ ...prev, [colId]: { ...prev[colId], [jour]: poste } }));
    setSaved(false);
  }

  function cyclePoste(colId: string, jour: string) {
    if (readOnly) return;
    setGrille(prev => {
      const current: Poste = prev[colId]?.[jour] ?? 'R';
      const idxInCycle = POSTES_CYCLE.indexOf(current);
      // Si le poste actuel est un code spécial (hors cycle), on repart du début du cycle
      const next = idxInCycle === -1 ? POSTES_CYCLE[0] : POSTES_CYCLE[(idxInCycle + 1) % POSTES_CYCLE.length];
      return { ...prev, [colId]: { ...prev[colId], [jour]: next } };
    });
    setSaved(false);
  }

  // ---- Gestion appui long ----
  function handlePressStart(colId: string, jour: string) {
    if (readOnly) return;
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setPosteMenu({ colId, jour });
    }, LONG_PRESS_MS);
  }

  function handlePressEnd(colId: string, jour: string) {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if (!longPressTriggered.current && !readOnly) {
      cyclePoste(colId, jour);
    }
  }

  function handlePressCancel() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  async function handleSave() {
    if (readOnly) return;
    setSaving(true);
    try {
      const debut = formatDate(semaine);
      let pid = planningId;
      if (!pid) {
        const { data, error: errUpsertPlanning } = await supabase.from('plannings')
          .upsert({ rayon_id: rayonId, semaine_debut: debut, created_by: profile?.id, statut: 'brouillon' },
            { onConflict: 'rayon_id,semaine_debut' })
          .select('id').single();
        if (errUpsertPlanning) throw errUpsertPlanning;
        pid = data?.id ?? null;
        setPlanningId(pid);
        setPlanningStatut('brouillon');
      }
      if (!pid) { setSaving(false); return; }
      // Retire les lignes des collaborateurs absents de la grille avant d'écraser le reste (cf. lib/planningLignes)
      await purgerLignesOrphelines('planning_lignes', pid, Object.keys(grille));
      const lignes = [];
      for (const [colId, jours_map] of Object.entries(grille)) {
        for (const [jour, poste] of Object.entries(jours_map)) {
          lignes.push({ planning_id: pid, collaborateur_id: colId, jour, poste });
        }
      }
      const { error: errUpsertLignes } = await supabase.from('planning_lignes')
        .upsert(lignes, { onConflict: 'planning_id,collaborateur_id,jour' });
      if (errUpsertLignes) throw errUpsertLignes;
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      void runCheck(semaine);
    } catch (err: any) {
      console.error('[DEBUG planning] Erreur sauvegarde :', err);
      toast.error(`Erreur lors de la sauvegarde du planning :\n${err?.message ?? err}`);
    } finally {
      setSaving(false);
    }
  }

  /** Recopie les postes de la semaine précédente (S-1) dans la grille courante, sans sauvegarder. */
  async function handleCopierSemainePrecedente() {
    if (readOnly || !rayonId) return;
    if (planningId) {
      const ok = await confirmDialog({
        title: 'Remplacer la grille actuelle ?',
        body: "La grille sera remplacée par celle de la semaine précédente. Rien n'est enregistré tant que tu ne cliques pas sur Sauvegarder.",
        confirmLabel: 'Remplacer',
      });
      if (!ok) return;
    }
    setCopying(true);
    try {
      const prevDebut = formatDate(addDays(semaine, -7));
      const { data: prevPlan, error: errPlan } = await supabase
        .from('plannings').select('id')
        .eq('rayon_id', rayonId).eq('semaine_debut', prevDebut).maybeSingle();
      if (errPlan) throw errPlan;
      if (!prevPlan) { toast.info('Aucun planning enregistré pour la semaine précédente.'); return; }

      const { data: prevLignes, error: errLignes } = await supabase
        .from('planning_lignes').select('collaborateur_id, jour, poste')
        .eq('planning_id', prevPlan.id);
      if (errLignes) throw errLignes;

      const g: Grille = {};
      // Tous les collaborateurs actuels partent en Repos, puis on applique S-1 décalée de 7 jours
      for (const c of collaborateurs) {
        g[c.id] = {};
        for (const j of jours) g[c.id][formatDate(j)] = 'R';
      }
      for (const l of prevLignes ?? []) {
        if (!g[l.collaborateur_id]) continue; // collaborateur parti ou désactivé depuis
        const jourCible = formatDate(addDays(new Date(l.jour + 'T00:00:00'), 7));
        if (jourCible in g[l.collaborateur_id]) g[l.collaborateur_id][jourCible] = l.poste as Poste;
      }
      setGrille(g);
      setSaved(false);
    } catch (err: any) {
      console.error('[DEBUG planning] Erreur copie S-1 :', err);
      toast.error(`Erreur lors de la copie :\n${err?.message ?? err}`);
    } finally {
      setCopying(false);
    }
  }

  async function handleSoumettre() {
    if (!planningId || !profile) return;
    setSubmitting(true);
    try {
      // Contrôle frais (pas l'état partagé de l'assistant, qui ne se met à jour qu'après une
      // sauvegarde et peut donc être obsolète si le planning n'a pas été retouché cette session).
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

      const { error } = await supabase.from('plannings').update({ statut: 'soumis_dept', commentaire: null }).eq('id', planningId);
      if (error) throw error;
      setPlanningStatut('soumis_dept');
    } catch (err: any) {
      console.error('[DEBUG planning] Erreur soumission :', err);
      toast.error(`Erreur lors de la soumission du planning :\n${err?.message ?? err}`);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReprendreEnBrouillon() {
    if (!planningId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('plannings').update({ statut: 'brouillon', commentaire: null }).eq('id', planningId);
      if (error) throw error;
      setPlanningStatut('brouillon');
      setPlanningCommentaire(null);
    } catch (err: any) {
      console.error('[DEBUG planning] Erreur reprise en brouillon :', err);
      toast.error(`Erreur :\n${err?.message ?? err}`);
    } finally {
      setSubmitting(false);
    }
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
    doc.text(`Rayon : ${rayonNom}${depNom ? '  |  Dép. : ' + depNom : ''}  |  S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`, margin, 19);

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
        doc.setTextColor(30, 30, 30); doc.setFontSize(poste.length > 1 ? 7 : 9); doc.setFont('helvetica', 'bold');
        doc.text(poste, x + colW / 2, y + 6.5, { align: 'center' });
      });
      y += rowH;
    });
    doc.setDrawColor(210, 210, 210);
    doc.rect(margin, 28, pageW - margin * 2, y - 28);
    doc.line(margin + nameColW, 28, margin + nameColW, y);
    jours.forEach((_, i) => doc.line(margin + nameColW + i * colW, 28, margin + nameColW + i * colW, y));
    y += 5;
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(100, 100, 100);
    doc.text('M=Matin  T=Tranche  S=Soir  R=Repos  C=Congé  HN=Horaire Normal  MAL=Maladie  AT=Accident Travail  FOR=Formation', margin, y);
    doc.setTextColor(180, 180, 180);
    doc.text(`Imprimé le ${new Date().toLocaleDateString('fr-FR')}`, pageW - margin, y, { align: 'right' });
    doc.save(`planning_${rayonNom.toLowerCase().replace(/\s+/g, '_')}_S${numSemaine}_${formatDate(semaine)}.pdf`);
  }

  function handleExportExcel() {
    const headers = ['Collaborateur', 'Prénom', ...jours.map((j, i) => `${JOURS[i]} ${formatDisplay(j)}`), 'Travail', 'Repos/Congé', 'Absences'];
    const rows = collaborateurs.map(c => {
      const postes = jours.map(j => grille[c.id]?.[formatDate(j)] ?? 'R');
      const travail = postes.filter(estTravail).length;
      const repos = postes.filter(estRepos).length;
      const absences = postes.filter(estAbsence).length;
      return [c.nom, c.prenom, ...postes, travail, repos, absences];
    });
    const wsData = [
      [`PLANNING MARJANE TANGER — Rayon : ${rayonNom} — S${numSemaine} — du ${formatDisplayLong(semaine)} au ${formatDisplayLong(addDays(semaine, 6))}`],
      [], headers, ...rows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, ...jours.map(() => ({ wch: 12 })), { wch: 12 }, { wch: 14 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Planning');
    XLSX.writeFile(wb, `planning_${rayonNom.toLowerCase().replace(/\s+/g, '_')}_S${numSemaine}_${formatDate(semaine)}.xlsx`);
  }

  function handleTouchStartSwipe(e: React.TouchEvent) {
    touchStartX.current = e.targetTouches[0].clientX;
  }

  function handleTouchEndSwipe(e: React.TouchEvent) {
    touchEndX.current = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX.current;
    if (Math.abs(diff) > 60) {
      if (diff > 0) setSemaine(d => getLundi(addDays(d, 7)));
      else setSemaine(d => getLundi(addDays(d, -7)));
    }
  }

  const rayonsGroupes: Record<string, { depNom: string; rayons: Rayon[] }> = {};
  for (const r of rayons) {
    const depId = r.departement_id;
    const depNom = r.departements?.nom ?? '—';
    if (!rayonsGroupes[depId]) rayonsGroupes[depId] = { depNom, rayons: [] };
    rayonsGroupes[depId].rayons.push(r);
  }

  const semaineLabel = `S${numSemaine} — ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`;

  return (
    <div className="space-y-3">

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        {(isAdmin || isChefDep || isChefRayon) && rayons.length > 1 && (
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
            {Object.values(rayonsGroupes).map(({ depNom, rayons: depRayons }) => (
              <optgroup key={depNom} label={depNom}>
                {depRayons.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.numero ? `[${r.numero}] ` : ''}{r.nom}
                  </option>
                ))}
              </optgroup>
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

        {rayonId && collaborateurs.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {!readOnly && (
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saved ? '✓' : 'Sauv.'}
              </button>
            )}
            {!readOnly && (
              <button onClick={handleCopierSemainePrecedente} disabled={copying} title="Copier le planning de la semaine précédente"
                className="flex items-center gap-2 bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 disabled:opacity-60 transition">
                {copying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                <span className="hidden sm:inline">Copier S-1</span>
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

      {planningId && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${
            planningStatut === 'brouillon' && planningCommentaire ? 'bg-red-100 text-red-700' :
            planningStatut === 'brouillon' ? 'bg-gray-100 text-gray-600' :
            planningStatut === 'soumis_dept' ? 'bg-amber-100 text-amber-700' :
            planningStatut === 'soumis_admin' ? 'bg-blue-100 text-blue-700' :
            planningStatut === 'valide' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
          }`}>
            {planningStatut === 'brouillon' && planningCommentaire ? 'Rejeté — à corriger puis re-soumettre' :
             planningStatut === 'brouillon' ? 'Brouillon' :
             planningStatut === 'soumis_dept' ? "Soumis — en attente du Chef de Département" :
             planningStatut === 'soumis_admin' ? "Validé par le Département — en attente de l'Admin" :
             planningStatut === 'valide' ? 'Validé (Final) ✓' : 'Rejeté'}
          </span>
          {planningCommentaire && (
            <span className="text-xs text-red-600 bg-red-50 px-3 py-1.5 rounded-full">
              Motif : {planningCommentaire}
            </span>
          )}
        </div>
      )}

      {/* Légende */}
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

      {rayonId && !loading && collaborateurs.length > 0 && (
        <div
          className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
          onTouchStart={handleTouchStartSwipe}
          onTouchEnd={handleTouchEndSwipe}
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
                            onMouseDown={() => handlePressStart(c.id, dateStr)}
                            onMouseUp={() => handlePressEnd(c.id, dateStr)}
                            onMouseLeave={handlePressCancel}
                            onTouchStart={() => handlePressStart(c.id, dateStr)}
                            onTouchEnd={() => handlePressEnd(c.id, dateStr)}
                            onTouchCancel={handlePressCancel}
                            onContextMenu={e => e.preventDefault()}
                            disabled={readOnly}
                            className={`w-9 h-8 sm:w-11 rounded-lg border font-bold transition select-none ${
                              poste.length > 1 ? 'text-[9px]' : 'text-xs'
                            } ${POSTE_STYLE[poste]} ${readOnly ? 'cursor-default opacity-80' : 'hover:opacity-80 active:scale-95'}`}
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
          <div className="sm:hidden text-center py-2 text-xs text-gray-300">
            ← Glisse pour changer de semaine · Appui long = codes spéciaux →
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