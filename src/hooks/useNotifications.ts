import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Profile } from '../types';
import { canAccessAdmin } from '../types';

export interface RayonSansPlanning {
  id: string;
  nom: string;
  depNom: string;
  nb_collaborateurs: number;
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
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!profile) return;
    load();
  }, [profile]);

  async function load() {
    if (!profile) return;
    setLoading(true);

    const semaine = getLundi(new Date());
    const isAdmin = canAccessAdmin(profile.role);
    const isChefDep = profile.role === 'chef_departement';

    // Récupérer les rayons du périmètre
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rayQuery: any = supabase
      .from('rayons')
      .select('id, nom, departements(nom)')
      .eq('actif', true)
      .order('nom');

    if (profile.role === 'chef_rayon' && profile.rayon_id) {
      rayQuery = rayQuery.eq('id', profile.rayon_id);
    } else if (isChefDep && profile.departement_id) {
      rayQuery = rayQuery.eq('departement_id', profile.departement_id);
    }

    const { data: rayons } = await rayQuery;
    if (!rayons?.length) { setRayonsSansPlanning([]); setLoading(false); return; }

    // Récupérer les plannings existants cette semaine
    const { data: plannings } = await supabase
      .from('plannings')
      .select('rayon_id')
      .eq('semaine_debut', semaine);

    const planifiesIds = new Set((plannings ?? []).map((p: { rayon_id: string }) => p.rayon_id));

    // Récupérer nb collaborateurs par rayon
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
      .filter(r => (colMap[r.id] ?? 0) > 0) // ignorer les rayons sans collaborateurs
      .map(r => ({
        id: r.id,
        nom: r.nom,
        depNom: r.departements?.nom ?? '—',
        nb_collaborateurs: colMap[r.id] ?? 0,
      }));

    setRayonsSansPlanning(retard);
    setLoading(false);
  }

  return {
    rayonsSansPlanning,
    count: rayonsSansPlanning.length,
    loading,
    refresh: load,
  };
}
