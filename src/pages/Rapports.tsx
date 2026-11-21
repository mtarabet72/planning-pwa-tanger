import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { Loader2, Printer, FileText, Calendar, BarChart3, Sun, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { canAccessAdmin } from '../types';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { getLundi, addDays, formatDate, formatDisplay, parseDateIso, JOURS } from '../lib/dates';
import { lireParLots, lireToutesLesPages } from '../lib/pagination';
import { dessinerGraphiquesPDF } from '../lib/pdfGraphiques';
import { type Poste, POSTE_STYLE_FLAT as POSTE_STYLE, POSTE_LABEL, estTravail, estAbsence } from '../lib/postes';
import {
  PERIODES, estPeriode, estPoste, periodesVides, compterNatures, naturesVides, statsNatures, filtrerJournalier, filtrerHebdo, filtrerMensuel,
  statsJournalier, statsHebdo, statsMensuel, mentionsFiltres,
  type Periode, type RayonLigne, type SemaineLigne, type MoisLigne, type StatsPeriodes, type StatsNatures,
} from '../lib/rapports';
import RapportFiltres from '../components/RapportFiltres';
import RapportNatures from '../components/RapportNatures';

// recharts est lourd : chargé à la demande, uniquement quand le bloc de statistiques est affiché.
const RapportGraphiques = lazy(() => import('../components/RapportGraphiques'));

// Variante longue AVEC le nom du jour (spécifique aux rapports quotidiens) — différente de
// formatDisplayLong de lib/dates.ts qui ne l'inclut pas, donc gardée locale intentionnellement.
function formatDisplayLong(date: Date): string {
  return date.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function getMonth(date: Date): { debut: Date; fin: Date } {
  const debut = new Date(date.getFullYear(), date.getMonth(), 1);
  const fin = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { debut, fin };
}

type TabType = 'journalier' | 'hebdomadaire' | 'mensuel';

/** Libellé du groupe « Encadrement » (Chefs de Rayon & Assistantes) dans les listes, au même titre qu'un rayon. */
const ENCADREMENT = 'Encadrement';

const ORDRE_POSTE: Record<Poste, number> = { M: 0, T: 1, S: 2, HN: 3, R: 4, C: 5, MAL: 6, AT: 7, FOR: 8, FE: 9, JR: 10 };

const moisCourant = (): string => {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
};

/** Tronque un texte pour qu'il tienne dans `maxW` mm avec la police courante de jsPDF. */
function tronquer(doc: jsPDF, texte: string, maxW: number): string {
  if (doc.getTextWidth(texte) <= maxW) return texte;
  let t = texte;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
  return `${t}...`;
}

/**
 * Bandeau bleu des PDF (inchangé visuellement) + mention des filtres actifs alignée à droite :
 * 1 filtre → sur la ligne du sous-titre ; 2 filtres → un sur la ligne du titre, un sur celle du sous-titre.
 */
function dessinerEntete(doc: jsPDF, o: {
  pageW: number; margin: number;
  titre: string; titreSize: number;
  sousTitre: string; sousTitreSize: number;
  filtres: string[];
}) {
  const { pageW, margin, titre, titreSize, sousTitre, sousTitreSize, filtres } = o;
  doc.setFillColor(37, 99, 235);
  doc.rect(0, 0, pageW, 22, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(titreSize);
  doc.setFont('helvetica', 'bold');
  doc.text(titre, margin, 10);
  const titreW = doc.getTextWidth(titre);
  doc.setFontSize(sousTitreSize);
  doc.setFont('helvetica', 'normal');
  doc.text(sousTitre, margin, 17);
  const sousW = doc.getTextWidth(sousTitre);

  if (!filtres.length) return;
  doc.setFontSize(8);
  const lignes = filtres.length === 1
    ? [{ t: filtres[0], y: 17, w: sousW }]
    : [{ t: filtres[0], y: 10, w: titreW }, { t: filtres[1], y: 17, w: sousW }];
  for (const l of lignes) {
    const maxW = pageW - margin * 2 - l.w - 6;
    if (maxW < 20) continue;
    doc.text(tronquer(doc, l.t, maxW), pageW - margin, l.y, { align: 'right' });
  }
}

export default function Rapports() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const requeteRef = useRef(0);
  const isAdmin = canAccessAdmin(profile?.role ?? 'chef_rayon');
  const isChefDep = profile?.role === 'chef_departement';

  const [activeTab, setActiveTab] = useState<TabType>('journalier');
  const [loading, setLoading] = useState(false);

  const [date, setDate] = useState<string>(formatDate(new Date()));
  const [semaine, setSemaine] = useState<Date>(getLundi(new Date()));
  const [mois, setMois] = useState<string>(moisCourant);
  const [filterDep, setFilterDep] = useState<string>('');
  // Filtre période : tableau vide = « Toutes les périodes ». Appliqué côté client → aucun rechargement.
  const [periodes, setPeriodes] = useState<Periode[]>([]);
  const [showStats, setShowStats] = useState(true);

  const [departements, setDepartements] = useState<{ id: string; nom: string }[]>([]);
  const [journalierData, setJournalierData] = useState<RayonLigne[]>([]);
  const [hebdoData, setHebdoData] = useState<SemaineLigne[]>([]);
  const [moisData, setMoisData] = useState<MoisLigne[]>([]);

  const jours = Array.from({ length: 7 }, (_, i) => addDays(semaine, i));

  // Filtrage côté client : changer de période met à jour liste, graphiques et PDF sans requête Supabase.
  const journalierFiltre = useMemo(() => filtrerJournalier(journalierData, periodes), [journalierData, periodes]);
  const hebdoFiltre = useMemo(() => filtrerHebdo(hebdoData, periodes), [hebdoData, periodes]);
  const moisFiltre = useMemo(() => filtrerMensuel(moisData, periodes), [moisData, periodes]);

  const statsJour = useMemo(() => statsJournalier(journalierFiltre), [journalierFiltre]);
  const statsSemaine = useMemo(() => statsHebdo(hebdoFiltre), [hebdoFiltre]);
  const statsMois = useMemo(() => statsMensuel(moisFiltre), [moisFiltre]);

  // Natures de poste (repos, congé, maladie…) : toujours sur les données non filtrées par période.
  const naturesJour = useMemo(() => statsNatures(journalierData), [journalierData]);
  const naturesSemaine = useMemo(() => statsNatures(hebdoData), [hebdoData]);
  const naturesMois = useMemo(() => statsNatures(moisData), [moisData]);

  const departementNom = filterDep ? departements.find(d => d.id === filterDep)?.nom ?? null : null;
  const mentions = useMemo(() => mentionsFiltres(periodes, departementNom), [periodes, departementNom]);

  const filtresParDefaut =
    periodes.length === 0 && filterDep === '' &&
    date === formatDate(new Date()) &&
    formatDate(semaine) === formatDate(getLundi(new Date())) &&
    mois === moisCourant();

  const resetFiltres = useCallback(() => {
    setPeriodes([]);
    setFilterDep('');
    setDate(formatDate(new Date()));
    setSemaine(getLundi(new Date()));
    setMois(moisCourant());
  }, []);

  useEffect(() => { loadDeps(); }, []);
  useEffect(() => { loadReport(); }, [activeTab, date, semaine, mois, filterDep]);

  async function loadDeps() {
    const { data } = await supabase.from('departements').select('id, nom').order('nom');
    setDepartements(data ?? []);
  }

  async function loadReport() {
    const id = ++requeteRef.current;
    const estCourant = () => id === requeteRef.current; // ignore les réponses périmées (changement rapide de filtre)
    setLoading(true);
    try {
      if (activeTab === 'journalier') await loadJournalier(estCourant);
      else if (activeTab === 'hebdomadaire') await loadHebdo(estCourant);
      else await loadMensuel(estCourant);
    } catch (e) {
      if (estCourant()) toast.error(`Chargement du rapport impossible : ${e instanceof Error ? e.message : 'erreur inconnue'}`);
    } finally {
      if (estCourant()) setLoading(false);
    }
  }

  /** Rayons visibles selon le rôle (chef de rayon / chef de département) ou le département choisi (admin). */
  async function chargerRayons() {
    let rayQuery = supabase.from('rayons').select('id, nom, departements(nom)').eq('actif', true).order('nom');
    if (profile?.role === 'chef_rayon' && profile.rayon_ids.length > 0) rayQuery = rayQuery.in('id', profile.rayon_ids);
    else if (isChefDep && (profile?.departement_ids?.length ?? 0) > 0) rayQuery = rayQuery.in('departement_id', profile!.departement_ids);
    else if (filterDep) rayQuery = rayQuery.eq('departement_id', filterDep);
    const { data, error } = await rayQuery;
    if (error) throw new Error(error.message);
    // Cf. Departements.tsx : `departements` est déduit comme un tableau par le générateur de types
    // pour cette relation imbriquée, alors que PostgREST renvoie un objet unique.
    return (data ?? []) as unknown as { id: string; nom: string; departements: { nom: string } | null }[];
  }

  /**
   * Départements dont on affiche l'encadrement (Chefs de Rayon & Assistantes, planning par département) :
   * administrateur et chefs de département uniquement, comme l'écran Encadrement ; mêmes filtres que les rayons.
   */
  async function chargerDepartementsEncadrement(): Promise<{ id: string; nom: string }[]> {
    if (!isAdmin && !isChefDep) return [];
    let q = supabase.from('departements').select('id, nom').order('nom');
    if (isChefDep && (profile?.departement_ids?.length ?? 0) > 0) q = q.in('id', profile!.departement_ids);
    else if (filterDep) q = q.eq('id', filterDep);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  }

  async function chargerCollaborateursEncadrement(depIds: string[]) {
    return lireParLots(depIds, (lot, d, f) =>
      supabase.from('collaborateurs').select('id, nom, prenom, departement_id')
        .in('departement_id', lot).eq('actif', true).in('fonction', ['chef_rayon', 'assistante'])
        .order('nom').order('id').range(d, f));
  }

  // Chargements : requêtes groupées (quelques appels au total, indépendants du nombre de rayons /
  // collaborateurs) + pagination au-delà de 1000 lignes (cf. lib/pagination.ts).

  async function loadJournalier(estCourant: () => boolean) {
    const rayons = await chargerRayons();
    const lundi = formatDate(getLundi(parseDateIso(date)));
    const rayonIds = rayons.map(r => r.id);

    const plans = await lireParLots(rayonIds, (lot, d, f) =>
      supabase.from('plannings').select('id, rayon_id').in('rayon_id', lot).eq('semaine_debut', lundi).order('id').range(d, f));
    const rayonParPlan = new Map(plans.map(p => [p.id, p.rayon_id]));

    // Toutes les lignes du jour (travail, repos, congé, maladie…) : la liste n'affiche que les présents (M, T, S, HN),
    // les statistiques de natures comptent tout.
    const lignes = await lireParLots(plans.map(p => p.id), (lot, d, f) =>
      supabase.from('planning_lignes').select('id, planning_id, collaborateur_id, poste')
        .in('planning_id', lot).eq('jour', date).order('id').range(d, f));

    const colIds = [...new Set(lignes.filter(l => estPeriode(l.poste)).map(l => l.collaborateur_id))];
    const cols = await lireParLots(colIds, (lot, d, f) =>
      supabase.from('collaborateurs').select('id, nom, prenom').in('id', lot).order('id').range(d, f));
    const colParId = new Map(cols.map(c => [c.id, c]));

    const parRayon = new Map<string, RayonLigne['collaborateurs']>();
    const naturesParRayon = new Map<string, Record<Poste, number>>();
    for (const l of lignes) {
      const rayonId = rayonParPlan.get(l.planning_id);
      if (!rayonId) continue;
      let nat = naturesParRayon.get(rayonId);
      if (!nat) { nat = naturesVides(); naturesParRayon.set(rayonId, nat); }
      if (estPoste(l.poste)) nat[l.poste]++;

      const col = colParId.get(l.collaborateur_id);
      if (!col || !estPeriode(l.poste)) continue;
      let liste = parRayon.get(rayonId);
      if (!liste) { liste = []; parRayon.set(rayonId, liste); }
      liste.push({ nom: col.nom, prenom: col.prenom, poste: l.poste });
    }

    const result: RayonLigne[] = [];
    for (const rayon of rayons) {
      const natures = naturesParRayon.get(rayon.id);
      if (!natures) continue; // aucun planning enregistré ce jour-là pour ce rayon
      const cs = parRayon.get(rayon.id) ?? [];
      cs.sort((a, b) => ORDRE_POSTE[a.poste] - ORDRE_POSTE[b.poste] || a.nom.localeCompare(b.nom));
      result.push({ rayonNom: rayon.nom, depNom: rayon.departements?.nom ?? '', collaborateurs: cs, natures });
    }

    // Encadrement (Chefs de Rayon & Assistantes) : un groupe par département, après les rayons
    const deps = await chargerDepartementsEncadrement();
    if (deps.length) {
      const encPlans = await lireParLots(deps.map(d => d.id), (lot, d, f) =>
        supabase.from('plannings_encadrement').select('id, departement_id').in('departement_id', lot).eq('semaine_debut', lundi).order('id').range(d, f));
      const depParPlan = new Map(encPlans.map(p => [p.id, p.departement_id]));
      const encLignes = await lireParLots(encPlans.map(p => p.id), (lot, d, f) =>
        supabase.from('planning_encadrement_lignes').select('id, planning_id, collaborateur_id, poste')
          .in('planning_id', lot).eq('jour', date).order('id').range(d, f));
      const encCols = await chargerCollaborateursEncadrement(deps.map(d => d.id));
      const encColParId = new Map(encCols.map(c => [c.id, c]));

      const parDep = new Map<string, RayonLigne['collaborateurs']>();
      const naturesParDep = new Map<string, Record<Poste, number>>();
      for (const l of encLignes) {
        const depId = depParPlan.get(l.planning_id);
        const col = encColParId.get(l.collaborateur_id);
        if (!depId || !col) continue;
        let nat = naturesParDep.get(depId);
        if (!nat) { nat = naturesVides(); naturesParDep.set(depId, nat); }
        if (estPoste(l.poste)) nat[l.poste]++;
        if (!estPeriode(l.poste)) continue;
        let liste = parDep.get(depId);
        if (!liste) { liste = []; parDep.set(depId, liste); }
        liste.push({ nom: col.nom, prenom: col.prenom, poste: l.poste });
      }
      for (const dep of deps) {
        const natures = naturesParDep.get(dep.id);
        if (!natures) continue;
        const cs = parDep.get(dep.id) ?? [];
        cs.sort((a, b) => ORDRE_POSTE[a.poste] - ORDRE_POSTE[b.poste] || a.nom.localeCompare(b.nom));
        result.push({ rayonNom: ENCADREMENT, depNom: dep.nom, collaborateurs: cs, natures });
      }
    }
    if (estCourant()) setJournalierData(result);
  }

  async function loadHebdo(estCourant: () => boolean) {
    const rayons = await chargerRayons();
    const rayonIds = rayons.map(r => r.id);
    const debut = formatDate(semaine);
    const fin = formatDate(addDays(semaine, 6));

    const plans = await lireParLots(rayonIds, (lot, d, f) =>
      supabase.from('plannings').select('id, rayon_id').in('rayon_id', lot).eq('semaine_debut', debut).order('id').range(d, f));
    const planParRayon = new Map(plans.map(p => [p.rayon_id, p.id]));

    const cols = await lireParLots(rayonIds, (lot, d, f) =>
      supabase.from('collaborateurs').select('id, nom, prenom, rayon_id')
        .in('rayon_id', lot).eq('actif', true).neq('fonction', 'chef_rayon').order('nom').order('id').range(d, f));

    const lignes = await lireParLots(plans.map(p => p.id), (lot, d, f) =>
      supabase.from('planning_lignes').select('id, planning_id, collaborateur_id, jour, poste')
        .in('planning_id', lot).gte('jour', debut).lte('jour', fin).order('id').range(d, f));
    const posteParCase = new Map(lignes.map(l => [`${l.planning_id}|${l.collaborateur_id}|${l.jour}`, l.poste as Poste]));

    const colsParRayon = new Map<string, typeof cols>();
    for (const c of cols) {
      if (c.rayon_id === null) continue;
      let liste = colsParRayon.get(c.rayon_id);
      if (!liste) { liste = []; colsParRayon.set(c.rayon_id, liste); }
      liste.push(c);
    }

    const result: SemaineLigne[] = [];
    for (const rayon of rayons) {
      const cs = colsParRayon.get(rayon.id);
      if (!cs?.length) continue;
      const planId = planParRayon.get(rayon.id);
      result.push({
        rayonNom: rayon.nom,
        depNom: rayon.departements?.nom ?? '',
        collaborateurs: cs.map(c => ({
          nom: c.nom,
          prenom: c.prenom,
          postes: jours.map(j => (planId ? posteParCase.get(`${planId}|${c.id}|${formatDate(j)}`) : undefined) ?? 'R'),
        })),
        natures: compterNatures(
          planId ? cs.flatMap(c => jours.flatMap(j => posteParCase.get(`${planId}|${c.id}|${formatDate(j)}`) ?? [])) : [],
        ),
      });
    }

    // Encadrement (Chefs de Rayon & Assistantes) : une grille par département, après les rayons
    const deps = await chargerDepartementsEncadrement();
    if (deps.length) {
      const depIds = deps.map(d => d.id);
      const encCols = await chargerCollaborateursEncadrement(depIds);
      const encPlans = await lireParLots(depIds, (lot, d, f) =>
        supabase.from('plannings_encadrement').select('id, departement_id').in('departement_id', lot).eq('semaine_debut', debut).order('id').range(d, f));
      const planParDep = new Map(encPlans.map(p => [p.departement_id, p.id]));
      const encLignes = await lireParLots(encPlans.map(p => p.id), (lot, d, f) =>
        supabase.from('planning_encadrement_lignes').select('id, planning_id, collaborateur_id, jour, poste')
          .in('planning_id', lot).gte('jour', debut).lte('jour', fin).order('id').range(d, f));
      const posteEnc = new Map(encLignes.map(l => [`${l.planning_id}|${l.collaborateur_id}|${l.jour}`, l.poste as Poste]));

      for (const dep of deps) {
        const cs = encCols.filter(c => c.departement_id === dep.id);
        if (!cs.length) continue;
        const planId = planParDep.get(dep.id);
        result.push({
          rayonNom: ENCADREMENT,
          depNom: dep.nom,
          collaborateurs: cs.map(c => ({
            nom: c.nom,
            prenom: c.prenom,
            postes: jours.map(j => (planId ? posteEnc.get(`${planId}|${c.id}|${formatDate(j)}`) : undefined) ?? 'R'),
          })),
          natures: compterNatures(
            planId ? cs.flatMap(c => jours.flatMap(j => posteEnc.get(`${planId}|${c.id}|${formatDate(j)}`) ?? [])) : [],
          ),
        });
      }
    }
    if (estCourant()) setHebdoData(result);
  }

  async function loadMensuel(estCourant: () => boolean) {
    const [year, month] = mois.split('-').map(Number);
    const { debut, fin } = getMonth(new Date(year, month - 1, 1));

    // Périmètre de rayons selon le rôle ; null = aucun filtre (administrateur sans département choisi).
    let perimetre: string[] | null = null;
    if (profile?.role === 'chef_rayon' && profile.rayon_ids.length > 0) {
      perimetre = profile.rayon_ids;
    } else if ((isChefDep && (profile?.departement_ids?.length ?? 0) > 0) || filterDep) {
      const depIds = isChefDep && (profile?.departement_ids?.length ?? 0) > 0 ? profile!.departement_ids : [filterDep];
      const { data: rays, error } = await supabase.from('rayons').select('id').in('departement_id', depIds);
      if (error) throw new Error(error.message);
      perimetre = (rays ?? []).map((r: { id: string }) => r.id);
    }

    const colQuery = () => supabase.from('collaborateurs')
      .select('id, nom, prenom, rayon_id, rayons(nom, departements(nom))')
      .eq('actif', true).neq('fonction', 'chef_rayon').order('nom').order('id');
    const colsRaw = perimetre
      ? await lireParLots(perimetre, (lot, d, f) => colQuery().in('rayon_id', lot).range(d, f))
      : await lireToutesLesPages((d, f) => colQuery().range(d, f));
    const cols = (colsRaw as unknown as { id: string; nom: string; prenom: string; rayons: { nom: string; departements: { nom: string } | null } | null }[])
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

    // Uniquement les lignes des collaborateurs concernés (et non celles de tout le magasin), par lots + pages.
    const lignes = await lireParLots(cols.map(c => c.id), (lot, d, f) =>
      supabase.from('planning_lignes').select('id, collaborateur_id, poste')
        .in('collaborateur_id', lot).gte('jour', formatDate(debut)).lte('jour', formatDate(fin)).order('id').range(d, f));

    // Regroupement unique par collaborateur (évite un filter() sur toutes les lignes pour chaque collaborateur).
    const grouper = (items: { collaborateur_id: string; poste: string }[]) => {
      const m = new Map<string, string[]>();
      for (const l of items) {
        let arr = m.get(l.collaborateur_id);
        if (!arr) { arr = []; m.set(l.collaborateur_id, arr); }
        arr.push(l.poste);
      }
      return m;
    };
    const postesParCollab = grouper(lignes);

    const ligneMois = (nom: string, prenom: string, rayonNom: string, depNom: string, postes: string[]): MoisLigne => {
      const parPeriode = periodesVides();
      let repos = 0, conge = 0, absences = 0;
      for (const p of postes) {
        if (estPeriode(p)) parPeriode[p]++;
        if (['R', 'FE', 'JR'].includes(p)) repos++;
        else if (p === 'C') conge++;
        if (estAbsence(p)) absences++;
      }
      return {
        nom, prenom, rayonNom, depNom,
        travail: PERIODES.reduce((a, p) => a + parPeriode[p], 0),
        repos,
        conge,
        absences,
        total: postes.length,
        parPeriode,
        natures: compterNatures(postes),
      };
    };

    const result: MoisLigne[] = cols.map(c =>
      ligneMois(c.nom, c.prenom, c.rayons?.nom ?? '—', c.rayons?.departements?.nom ?? '', postesParCollab.get(c.id) ?? []));

    // Encadrement (Chefs de Rayon & Assistantes) : lignes du planning d'encadrement, ajoutées après les rayons
    const deps = await chargerDepartementsEncadrement();
    if (deps.length) {
      const nomDep = new Map(deps.map(d => [d.id, d.nom]));
      const encCols = await chargerCollaborateursEncadrement(deps.map(d => d.id));
      const encLignes = await lireParLots(encCols.map(c => c.id), (lot, d, f) =>
        supabase.from('planning_encadrement_lignes').select('id, collaborateur_id, poste')
          .in('collaborateur_id', lot).gte('jour', formatDate(debut)).lte('jour', formatDate(fin)).order('id').range(d, f));
      const postesEnc = grouper(encLignes);
      encCols
        .sort((a, b) => (nomDep.get(a.departement_id ?? '') ?? '').localeCompare(nomDep.get(b.departement_id ?? '') ?? '', 'fr') || a.nom.localeCompare(b.nom, 'fr'))
        .forEach(c => result.push(ligneMois(c.nom, c.prenom, ENCADREMENT, nomDep.get(c.departement_id ?? '') ?? '', postesEnc.get(c.id) ?? [])));
    }
    if (estCourant()) setMoisData(result);
  }

  function exportJournalierPDF() {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const margin = 14;
    const pageW = 210;

    dessinerEntete(doc, {
      pageW, margin,
      titre: 'RAPPORT JOURNALIER — MARJANE TANGER', titreSize: 13,
      sousTitre: formatDisplayLong(new Date(date)), sousTitreSize: 8,
      filtres: mentions,
    });

    let y = 28;
    const total = journalierFiltre.reduce((acc, r) => acc + r.collaborateurs.length, 0);
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(`Total présents : ${total} collaborateur(s)`, margin, y);
    y += 8;

    y = dessinerGraphiquesPDF(doc, statsJour, {
      x: margin, y, largeur: pageW - margin * 2, pageH: 297, unite: 'collaborateurs', periodes, natures: naturesJour,
      nouvellePage: () => { doc.addPage(); return 20; },
    });

    for (const rayon of journalierFiltre) {
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

    if (statsSemaine.total > 0 || naturesSemaine.total > 0) {
      dessinerEntete(doc, {
        pageW, margin,
        titre: 'RAPPORT HEBDOMADAIRE — STATISTIQUES', titreSize: 12,
        sousTitre: `Semaine du ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`, sousTitreSize: 8,
        filtres: mentions,
      });
      dessinerGraphiquesPDF(doc, statsSemaine, {
        x: margin, y: 28, largeur: pageW - margin * 2, pageH: 210, unite: 'jours-collaborateur', periodes, natures: naturesSemaine,
        nouvellePage: () => { doc.addPage(); return 20; },
      });
      firstPage = false;
    }

    for (const rayon of hebdoFiltre) {
      if (!rayon.collaborateurs.length) continue;
      if (!firstPage) doc.addPage();
      firstPage = false;

      dessinerEntete(doc, {
        pageW, margin,
        titre: `RAPPORT HEBDOMADAIRE — ${rayon.rayonNom}`, titreSize: 12,
        sousTitre: `${rayon.depNom}  |  Semaine du ${formatDisplay(semaine)} au ${formatDisplay(addDays(semaine, 6))}`, sousTitreSize: 8,
        filtres: mentions,
      });

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
          if (p === null) return; // case masquée par le filtre de période
          const x = margin + nameColW + i * colW;
          doc.setFontSize(p.length > 1 ? 6 : 8);
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

    const headers = ['Nom', 'Prénom', 'Rayon', 'Jours Travaillés', 'Jours Repos', 'Jours Congé', 'Jours Absence', 'Total Planifié'];
    const rows = moisFiltre.map(c => [c.nom, c.prenom, c.rayonNom, c.travail, c.repos, c.conge, c.absences, c.total]);

    const wsData = [
      [`RAPPORT MENSUEL — MARJANE TANGER — ${nomMois.toUpperCase()}`],
      mentions.length ? [mentions.join('  |  ')] : [],
      headers,
      ...rows,
      [],
      ['TOTAL', '', '', moisFiltre.reduce((a, c) => a + c.travail, 0), moisFiltre.reduce((a, c) => a + c.repos, 0), moisFiltre.reduce((a, c) => a + c.conge, 0), moisFiltre.reduce((a, c) => a + c.absences, 0), ''],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 16 }, { wch: 12 }, { wch: 12 }, { wch: 13 }, { wch: 14 }];
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

    dessinerEntete(doc, {
      pageW, margin,
      titre: 'RAPPORT MENSUEL — MARJANE TANGER', titreSize: 13,
      sousTitre: nomMois.charAt(0).toUpperCase() + nomMois.slice(1), sousTitreSize: 9,
      filtres: mentions,
    });

    let y = dessinerGraphiquesPDF(doc, statsMois, {
      x: margin, y: 28, largeur: pageW - margin * 2, pageH: 297, unite: 'jours-collaborateur', periodes, natures: naturesMois,
      nouvellePage: () => { doc.addPage(); return 20; },
    });
    if (y > 255) { doc.addPage(); y = 20; }
    const colWidths = [40, 26, 20, 18, 18, 20, 20];
    const headers = ['Collaborateur', 'Rayon', 'Travail', 'Repos', 'Congé', 'Absence', 'Total'];
    doc.setFillColor(240, 242, 255);
    doc.rect(margin, y, pageW - margin * 2, 8, 'F');
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    let x = margin;
    headers.forEach((h, i) => {
      doc.text(h, x + 2, y + 5.5);
      x += colWidths[i];
    });
    y += 8;

    moisFiltre.forEach((c, idx) => {
      if (y > 275) { doc.addPage(); y = 20; }
      const bg: [number, number, number] = idx % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
      doc.setFillColor(...bg);
      doc.rect(margin, y, pageW - margin * 2, 7, 'F');
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      x = margin;
      const vals = [`${c.nom} ${c.prenom}`, c.rayonNom, `${c.travail}j`, `${c.repos}j`, `${c.conge}j`, `${c.absences}j`, `${c.total}j`];
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

  /** Bloc de statistiques (repliable) placé au-dessus de la liste ; suit les filtres actifs. */
  function renderStats(stats: StatsPeriodes, natures: StatsNatures, unite: string) {
    if (stats.total === 0 && natures.total === 0) return null;
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setShowStats(v => !v)}
          aria-expanded={showStats}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-blue-600 transition"
        >
          <BarChart3 className="w-4 h-4" /> Statistiques
          {showStats ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {showStats && (
          <>
            {(stats.total > 0 || periodes.length > 0) && (
              <Suspense fallback={<div className="flex justify-center py-10"><Loader2 className="w-5 h-5 text-blue-500 animate-spin" /></div>}>
                <RapportGraphiques stats={stats} periodes={periodes} unite={unite} />
              </Suspense>
            )}
            <RapportNatures stats={natures} unite={unite} />
          </>
        )}
      </div>
    );
  }

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
        {activeTab === 'journalier' && journalierFiltre.length > 0 && (
          <button onClick={exportJournalierPDF} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
            <Printer className="w-4 h-4" /> PDF
          </button>
        )}
        {activeTab === 'hebdomadaire' && hebdoFiltre.length > 0 && (
          <button onClick={exportHebdoPDF} className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-emerald-700 transition">
            <Printer className="w-4 h-4" /> PDF
          </button>
        )}
        {activeTab === 'mensuel' && moisFiltre.length > 0 && (
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

      <RapportFiltres periodes={periodes} onChange={setPeriodes} onReset={resetFiltres} resetDisabled={filtresParDefaut} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <>
          {activeTab === 'journalier' && (
            <div className="space-y-3">
              {renderStats(statsJour, naturesJour, 'collaborateurs')}
              {journalierFiltre.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
                  {periodes.length > 0
                    ? 'Aucun collaborateur ne correspond à la période sélectionnée ce jour.'
                    : 'Aucun collaborateur présent ce jour ou aucun planning sauvegardé.'}
                </div>
              ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
                    <div className="text-2xl font-bold text-blue-600">{statsJour.total}</div>
                    <div className="text-xs text-gray-500 mt-1">Présents aujourd'hui</div>
                  </div>
                  <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{journalierFiltre.length}</div>
                    <div className="text-xs text-gray-500 mt-1">Rayons concernés</div>
                  </div>
                </div>
                {journalierFiltre.map(rayon => (
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
              </>
              )}
            </div>
          )}

          {activeTab === 'hebdomadaire' && (
            <div className="space-y-4">
              {renderStats(statsSemaine, naturesSemaine, 'jours-collaborateur')}
              {hebdoFiltre.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
                  {hebdoData.length > 0
                    ? 'Aucun collaborateur ne correspond à la période sélectionnée cette semaine.'
                    : 'Aucune donnée pour cette semaine.'}
                </div>
              ) : (
              <>
                {hebdoFiltre.map(rayon => (
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
                            const travail = c.postes.filter(p => p !== null && estTravail(p)).length;
                            return (
                              <tr key={i} className="hover:bg-gray-50">
                                <td className="px-4 py-2 font-medium">{c.nom} <span className="text-gray-400 font-normal">{c.prenom}</span></td>
                                {c.postes.map((p, j) => (
                                  <td key={j} className="px-1 py-2 text-center">
                                    {p === null ? (
                                      <span className="text-gray-300">·</span>
                                    ) : (
                                      <span className={`inline-flex items-center justify-center w-8 h-6 rounded font-bold ${
                                        p.length > 1 ? 'text-[8px]' : 'text-xs'
                                      } ${POSTE_STYLE[p]}`}>{p}</span>
                                    )}
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
              </>
              )}
            </div>
          )}

          {activeTab === 'mensuel' && (
            <div className="space-y-4">
              {renderStats(statsMois, naturesMois, 'jours-collaborateur')}
              {moisFiltre.length === 0 ? (
                <div className="bg-white rounded-2xl p-10 text-center text-gray-400 text-sm">
                  {moisData.length > 0
                    ? 'Aucun collaborateur ne correspond à la période sélectionnée ce mois-ci.'
                    : 'Aucune donnée pour ce mois.'}
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
                        <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Absence</th>
                        <th className="text-center px-3 py-3 font-medium text-gray-500 text-xs">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {moisFiltre.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-sm">{c.nom}</div>
                            <div className="text-xs text-gray-400">{c.prenom}</div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">{c.rayonNom}</td>
                          <td className="px-3 py-3 text-center font-bold text-blue-600">{c.travail}j</td>
                          <td className="px-3 py-3 text-center text-gray-400 text-xs">{c.repos}j</td>
                          <td className="px-3 py-3 text-center text-emerald-600 text-xs">{c.conge}j</td>
                          <td className="px-3 py-3 text-center text-rose-500 text-xs">{c.absences}j</td>
                          <td className="px-3 py-3 text-center text-gray-500 text-xs">{c.total}j</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50 border-t border-gray-100">
                      <tr>
                        <td colSpan={2} className="px-4 py-3 font-semibold text-sm">TOTAL</td>
                        <td className="px-3 py-3 text-center font-bold text-blue-600">{moisFiltre.reduce((a: number, c: MoisLigne) => a + c.travail, 0)}j</td>
                        <td className="px-3 py-3 text-center text-gray-400 text-xs">{moisFiltre.reduce((a: number, c: MoisLigne) => a + c.repos, 0)}j</td>
                        <td className="px-3 py-3 text-center text-emerald-600 text-xs">{moisFiltre.reduce((a: number, c: MoisLigne) => a + c.conge, 0)}j</td>
                        <td className="px-3 py-3 text-center text-rose-500 text-xs">{moisFiltre.reduce((a: number, c: MoisLigne) => a + c.absences, 0)}j</td>
                        <td className="px-3 py-3 text-center text-gray-500 text-xs">{moisFiltre.reduce((a: number, c: MoisLigne) => a + c.total, 0)}j</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
