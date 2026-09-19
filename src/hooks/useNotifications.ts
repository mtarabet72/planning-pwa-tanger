import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { getLundiIso } from '../lib/dates';
import type { Profile } from '../types';

export interface RayonSansPlanning {
  id: string;
  nom: string;
  depNom: string;
  nb_collaborateurs: number;
}

export interface PlanningAttenteDept {
  id: string;
  rayonNom: string;
  depNom: string;
  semaineDebut: string;
}

/** Planning renvoyé au chef avec un motif : à corriger puis re-soumettre. */
export interface PlanningRejete {
  id: string;
  type: 'rayon' | 'encadrement';
  rayonNom: string | null;
  depNom: string;
  semaineDebut: string;
  commentaire: string;
}

/** Planning validé définitivement par l'admin récemment (information pour le chef). */
export interface PlanningValide {
  id: string;
  type: 'rayon' | 'encadrement';
  rayonNom: string | null;
  depNom: string;
  semaineDebut: string;
  valideAt: string;
}

export interface PlanningAttenteAdmin {
  id: string;
  type: 'rayon' | 'encadrement';
  rayonNom: string | null;
  depNom: string;
  semaineDebut: string;
}

const VUS_KEY = 'notif_valides_vus';
const JOURS_VALIDES_VISIBLES = 7;
const POLL_MS = 60_000;

function lireVus(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(VUS_KEY) ?? '[]')); } catch { return new Set(); }
}
function ecrireVus(ids: Set<string>) {
  try { localStorage.setItem(VUS_KEY, JSON.stringify([...ids].slice(-200))); } catch { /* stockage indisponible */ }
}

export function useNotifications(profile: Profile | null) {
  const [rayonsSansPlanning, setRayonsSansPlanning] = useState<RayonSansPlanning[]>([]);
  const [planningsAttenteDept, setPlanningsAttenteDept] = useState<PlanningAttenteDept[]>([]);
  const [planningsAttenteAdmin, setPlanningsAttenteAdmin] = useState<PlanningAttenteAdmin[]>([]);
  const [planningsRejetes, setPlanningsRejetes] = useState<PlanningRejete[]>([]);
  const [planningsValides, setPlanningsValides] = useState<PlanningValide[]>([]);
  const [validesVus, setValidesVus] = useState<Set<string>>(() => lireVus());
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  // Chargement initial + rafraîchissement automatique :
  // - temps réel Supabase sur les tables de plannings (si Realtime est activé côté dashboard),
  // - toutes les 60 s en secours,
  // - au retour sur l'app (onglet/PWA remis au premier plan).
  useEffect(() => {
    if (!profile) return;
    void load();

    const canal = supabase.channel(`notifs-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plannings' }, () => void load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'plannings_encadrement' }, () => void load())
      .subscribe();

    const timer = window.setInterval(() => void load(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);

    return () => {
      void supabase.removeChannel(canal);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  async function loadRayonsSansPlanning() {
    if (!profile) return;
    const semaine = getLundiIso(new Date());
    const isChefDep = profile.role === 'chef_departement';

    let rayQuery = supabase
      .from('rayons')
      .select('id, nom, departements(nom)')
      .eq('actif', true)
      .order('nom');

    if (profile.role === 'chef_rayon' && profile.rayon_ids.length > 0) {
      rayQuery = rayQuery.in('id', profile.rayon_ids);
    } else if (isChefDep && profile.departement_ids.length > 0) {
      rayQuery = rayQuery.in('departement_id', profile.departement_ids);
    }

    const { data: rayons } = await rayQuery;
    if (!rayons?.length) { setRayonsSansPlanning([]); return; }

    const { data: plannings } = await supabase
      .from('plannings')
      .select('rayon_id')
      .eq('semaine_debut', semaine);

    const planifiesIds = new Set((plannings ?? []).map((p: { rayon_id: string }) => p.rayon_id));

    const { data: cols } = await supabase
      .from('collaborateurs')
      .select('rayon_id')
      .eq('actif', true);

    const colMap: Record<string, number> = {};
    for (const c of (cols ?? []) as { rayon_id: string }[]) {
      if (c.rayon_id) colMap[c.rayon_id] = (colMap[c.rayon_id] ?? 0) + 1;
    }

    // Cf. Departements.tsx : `departements` est déduit comme un tableau par le générateur de
    // types pour cette relation imbriquée, alors que PostgREST renvoie un objet unique.
    const retard: RayonSansPlanning[] = (rayons as unknown as { id: string; nom: string; departements: { nom: string } | null }[])
      .filter(r => !planifiesIds.has(r.id))
      .filter(r => (colMap[r.id] ?? 0) > 0)
      .map(r => ({
        id: r.id,
        nom: r.nom,
        depNom: r.departements?.nom ?? '—',
        nb_collaborateurs: colMap[r.id] ?? 0,
      }));

    setRayonsSansPlanning(retard);
  }

  /** Chef de département : plannings rayon reçus des chefs de rayon, en attente de sa validation. */
  async function loadPlanningsAttenteDept() {
    if (!profile || profile.role !== 'chef_departement') { setPlanningsAttenteDept([]); return; }
    if (profile.departement_ids.length === 0) { setPlanningsAttenteDept([]); return; }

    const { data: rayonsDep } = await supabase
      .from('rayons').select('id').in('departement_id', profile.departement_ids);
    const rayonIds = (rayonsDep ?? []).map((r: { id: string }) => r.id);
    if (rayonIds.length === 0) { setPlanningsAttenteDept([]); return; }

    type RayonPlanningRow = { id: string; semaine_debut: string; rayons: { nom: string; departements: { nom: string } | null } | null };
    const { data } = await supabase
      .from('plannings')
      .select('id, semaine_debut, rayons(nom, departements(nom))')
      .eq('statut', 'soumis_dept')
      .in('rayon_id', rayonIds)
      .order('semaine_debut') as { data: RayonPlanningRow[] | null };

    setPlanningsAttenteDept((data ?? []).map(p => ({
      id: p.id,
      rayonNom: p.rayons?.nom ?? '—',
      depNom: p.rayons?.departements?.nom ?? '—',
      semaineDebut: p.semaine_debut,
    })));
  }

  /** Administrateur : plannings (rayon + encadrement) validés/soumis par les chefs de département, en attente de validation admin. */
  async function loadPlanningsAttenteAdmin() {
    if (!profile || profile.role !== 'administrateur') { setPlanningsAttenteAdmin([]); return; }

    type RayonPlanningRow = { id: string; semaine_debut: string; rayons: { nom: string; departements: { nom: string } | null } | null };
    type EncPlanningRow = { id: string; semaine_debut: string; departements: { nom: string } | null };
    const [{ data: rayonData }, { data: encData }] = await Promise.all([
      supabase.from('plannings')
        .select('id, semaine_debut, rayons(nom, departements(nom))')
        .eq('statut', 'soumis_admin')
        .order('semaine_debut'),
      supabase.from('plannings_encadrement')
        .select('id, semaine_debut, departements(nom)')
        .eq('statut', 'soumis')
        .order('semaine_debut'),
    ]) as [{ data: RayonPlanningRow[] | null }, { data: EncPlanningRow[] | null }];

    const rayonItems: PlanningAttenteAdmin[] = (rayonData ?? []).map(p => ({
      id: p.id,
      type: 'rayon',
      rayonNom: p.rayons?.nom ?? '—',
      depNom: p.rayons?.departements?.nom ?? '—',
      semaineDebut: p.semaine_debut,
    }));
    const encItems: PlanningAttenteAdmin[] = (encData ?? []).map(p => ({
      id: p.id,
      type: 'encadrement',
      rayonNom: null,
      depNom: p.departements?.nom ?? '—',
      semaineDebut: p.semaine_debut,
    }));

    setPlanningsAttenteAdmin([...rayonItems, ...encItems]);
  }

  /**
   * Plannings renvoyés avec un motif (statut brouillon + commentaire) :
   * - chef de rayon : ses plannings rayon rejetés par le département ou l'admin ;
   * - chef de département : ses plannings d'encadrement rejetés par l'admin.
   */
  async function loadPlanningsRejetes() {
    if (!profile) { setPlanningsRejetes([]); return; }

    if (profile.role === 'chef_rayon' && profile.rayon_ids.length > 0) {
      type RayonRejeteRow = { id: string; semaine_debut: string; commentaire: string; rayons: { nom: string; departements: { nom: string } | null } | null };
      const { data } = await supabase
        .from('plannings')
        .select('id, semaine_debut, commentaire, rayons(nom, departements(nom))')
        .eq('statut', 'brouillon')
        .not('commentaire', 'is', null)
        .in('rayon_id', profile.rayon_ids)
        .order('semaine_debut', { ascending: false }) as { data: RayonRejeteRow[] | null };
      setPlanningsRejetes((data ?? []).map(p => ({
        id: p.id, type: 'rayon', rayonNom: p.rayons?.nom ?? '—',
        depNom: p.rayons?.departements?.nom ?? '—', semaineDebut: p.semaine_debut, commentaire: p.commentaire,
      })));
      return;
    }

    if (profile.role === 'chef_departement' && profile.departement_ids.length > 0) {
      type EncRejeteRow = { id: string; semaine_debut: string; commentaire: string; departements: { nom: string } | null };
      const { data } = await supabase
        .from('plannings_encadrement')
        .select('id, semaine_debut, commentaire, departements(nom)')
        .eq('statut', 'brouillon')
        .not('commentaire', 'is', null)
        .in('departement_id', profile.departement_ids)
        .order('semaine_debut', { ascending: false }) as { data: EncRejeteRow[] | null };
      setPlanningsRejetes((data ?? []).map(p => ({
        id: p.id, type: 'encadrement', rayonNom: null,
        depNom: p.departements?.nom ?? '—', semaineDebut: p.semaine_debut, commentaire: p.commentaire,
      })));
      return;
    }

    setPlanningsRejetes([]);
  }

  /**
   * Plannings validés par l'admin dans les 7 derniers jours :
   * - chef de rayon : ses plannings rayon ;
   * - chef de département : ses plannings d'encadrement.
   */
  async function loadPlanningsValides() {
    if (!profile) { setPlanningsValides([]); return; }
    const depuis = new Date(Date.now() - JOURS_VALIDES_VISIBLES * 86400000).toISOString();

    if (profile.role === 'chef_rayon' && profile.rayon_ids.length > 0) {
      type RayonValideRow = { id: string; semaine_debut: string; valide_at: string; rayons: { nom: string; departements: { nom: string } | null } | null };
      const { data } = await supabase
        .from('plannings')
        .select('id, semaine_debut, valide_at, rayons(nom, departements(nom))')
        .eq('statut', 'valide')
        .gte('valide_at', depuis)
        .in('rayon_id', profile.rayon_ids)
        .order('valide_at', { ascending: false }) as { data: RayonValideRow[] | null };
      setPlanningsValides((data ?? []).map(p => ({
        id: p.id, type: 'rayon', rayonNom: p.rayons?.nom ?? '—',
        depNom: p.rayons?.departements?.nom ?? '—', semaineDebut: p.semaine_debut, valideAt: p.valide_at,
      })));
      return;
    }

    if (profile.role === 'chef_departement' && profile.departement_ids.length > 0) {
      type EncValideRow = { id: string; semaine_debut: string; valide_at: string; departements: { nom: string } | null };
      const { data } = await supabase
        .from('plannings_encadrement')
        .select('id, semaine_debut, valide_at, departements(nom)')
        .eq('statut', 'valide')
        .gte('valide_at', depuis)
        .in('departement_id', profile.departement_ids)
        .order('valide_at', { ascending: false }) as { data: EncValideRow[] | null };
      setPlanningsValides((data ?? []).map(p => ({
        id: p.id, type: 'encadrement', rayonNom: null,
        depNom: p.departements?.nom ?? '—', semaineDebut: p.semaine_debut, valideAt: p.valide_at,
      })));
      return;
    }

    setPlanningsValides([]);
  }

  async function load() {
    if (!profile || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    try {
      await Promise.all([
        loadRayonsSansPlanning(),
        loadPlanningsAttenteDept(),
        loadPlanningsAttenteAdmin(),
        loadPlanningsRejetes(),
        loadPlanningsValides(),
      ]);
    } catch (err) {
      console.error('[notifications] Erreur de chargement :', err);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  /** À appeler à l'ouverture du panneau : les validations affichées ne comptent plus dans le badge. */
  const marquerValidesVus = useCallback(() => {
    setValidesVus(prev => {
      const next = new Set(prev);
      for (const p of planningsValides) next.add(p.id);
      ecrireVus(next);
      return next;
    });
  }, [planningsValides]);

  const nbValidesNonVus = planningsValides.filter(p => !validesVus.has(p.id)).length;

  return {
    rayonsSansPlanning,
    planningsAttenteDept,
    planningsAttenteAdmin,
    planningsRejetes,
    planningsValides,
    nbValidesNonVus,
    marquerValidesVus,
    count: rayonsSansPlanning.length + planningsAttenteDept.length + planningsAttenteAdmin.length + planningsRejetes.length + nbValidesNonVus,
    loading,
    refresh: load,
  };
}