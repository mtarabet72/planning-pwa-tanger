import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
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

export interface PlanningAttenteAdmin {
  id: string;
  type: 'rayon' | 'encadrement';
  rayonNom: string | null;
  depNom: string;
  semaineDebut: string;
}

function getLundi(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function useNotifications(profile: Profile | null) {
  const [rayonsSansPlanning, setRayonsSansPlanning] = useState<RayonSansPlanning[]>([]);
  const [planningsAttenteDept, setPlanningsAttenteDept] = useState<PlanningAttenteDept[]>([]);
  const [planningsAttenteAdmin, setPlanningsAttenteAdmin] = useState<PlanningAttenteAdmin[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function loadRayonsSansPlanning() {
    if (!profile) return;
    const semaine = getLundi(new Date());
    const isChefDep = profile.role === 'chef_departement';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rayQuery: any = supabase
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retard: RayonSansPlanning[] = (rayons as any[])
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await supabase
      .from('plannings')
      .select('id, semaine_debut, rayons(nom, departements(nom))')
      .eq('statut', 'soumis_dept')
      .in('rayon_id', rayonIds)
      .order('semaine_debut') as { data: any[] | null };

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [{ data: rayonData }, { data: encData }] = await Promise.all([
      supabase.from('plannings')
        .select('id, semaine_debut, rayons(nom, departements(nom))')
        .eq('statut', 'soumis_admin')
        .order('semaine_debut'),
      supabase.from('plannings_encadrement')
        .select('id, semaine_debut, departements(nom)')
        .eq('statut', 'soumis')
        .order('semaine_debut'),
    ]) as [{ data: any[] | null }, { data: any[] | null }];

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

  async function load() {
    if (!profile) return;
    setLoading(true);
    try {
      await Promise.all([
        loadRayonsSansPlanning(),
        loadPlanningsAttenteDept(),
        loadPlanningsAttenteAdmin(),
      ]);
    } catch (err) {
      console.error('[notifications] Erreur de chargement :', err);
    } finally {
      setLoading(false);
    }
  }

  return {
    rayonsSansPlanning,
    planningsAttenteDept,
    planningsAttenteAdmin,
    count: rayonsSansPlanning.length + planningsAttenteDept.length + planningsAttenteAdmin.length,
    loading,
    refresh: load,
  };
}
