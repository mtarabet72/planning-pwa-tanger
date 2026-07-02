import { useState, useEffect } from 'react';
import { Users, Calendar, BarChart3, TrendingUp, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { canAccessAdmin } from '../types';

interface Stats {
  totalCollaborateurs: number;
  collaborateursActifs: number;
  planningsSemaine: number;
  totalRayons: number;
  repartitionPostes: Record<string, number>;
  rayonsActifs: { nom: string; nb: number }[];
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-gray-500">{label}</p>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
      <div className="text-4xl font-bold text-gray-900">{value}</div>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

const POSTE_LABEL: Record<string, string> = {
  M: 'Matin', AM: 'Après-midi', N: 'Nuit', R: 'Repos', C: 'Congé',
};

const POSTE_COLOR: Record<string, string> = {
  M:  'bg-amber-400',
  AM: 'bg-blue-400',
  N:  'bg-indigo-400',
  R:  'bg-gray-300',
  C:  'bg-emerald-400',
};

function getLundi(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

export default function Dashboard() {
  const { profile } = useAuth();
  const isAdmin = profile ? canAccessAdmin(profile.role) : false;
  const isChefDep = profile?.role === 'chef_departement';
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  async function loadStats() {
    setLoading(true);
    const semaineCourante = getLundi(new Date());

    // Collaborateurs
    let colQuery = supabase.from('collaborateurs').select('id, actif, rayon_id, rayons(nom)', { count: 'exact' });
    if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      colQuery = colQuery.eq('rayon_id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      colQuery = colQuery.in('rayon_id',
        (await supabase.from('rayons').select('id').eq('departement_id', profile.departement_id)).data?.map(r => r.id) ?? []
      );
    }
    const { data: cols } = await colQuery;
    const allCols = cols ?? [];
    const totalCollaborateurs = allCols.length;
    const collaborateursActifs = allCols.filter((c: { actif: boolean }) => c.actif).length;

    // Rayons actifs avec nb collaborateurs
    const rayonMap: Record<string, { nom: string; nb: number }> = {};
    for (const c of allCols as { actif: boolean; rayon_id: string; rayons: { nom: string } | null }[]) {
      if (!c.actif || !c.rayon_id) continue;
      if (!rayonMap[c.rayon_id]) rayonMap[c.rayon_id] = { nom: c.rayons?.nom ?? '—', nb: 0 };
      rayonMap[c.rayon_id].nb++;
    }
    const rayonsActifs = Object.values(rayonMap).sort((a, b) => b.nb - a.nb).slice(0, 5);

    // Plannings cette semaine
    let planQuery = supabase.from('plannings').select('id', { count: 'exact' }).eq('semaine_debut', semaineCourante);
    if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      planQuery = planQuery.eq('rayon_id', profile.rayon_id);
    } else if (isChefDep && profile?.departement_id) {
      planQuery = planQuery.in('rayon_id',
        (await supabase.from('rayons').select('id').eq('departement_id', profile.departement_id)).data?.map(r => r.id) ?? []
      );
    }
    const { count: planningsCount } = await planQuery;

    // Rayons total
    let rayonsQuery = supabase.from('rayons').select('id', { count: 'exact' }).eq('actif', true);
    if (isChefDep && profile?.departement_id) {
      rayonsQuery = rayonsQuery.eq('departement_id', profile.departement_id);
    } else if (profile?.role === 'chef_rayon' && profile.rayon_id) {
      rayonsQuery = rayonsQuery.eq('id', profile.rayon_id);
    }
    const { count: rayonsCount } = await rayonsQuery;

    // Répartition postes cette semaine
    const { data: lignes } = await supabase
      .from('planning_lignes')
      .select('poste, planning_id, plannings!inner(semaine_debut, rayon_id)')
      .eq('plannings.semaine_debut', semaineCourante);

    const repartition: Record<string, number> = { M: 0, AM: 0, N: 0, R: 0, C: 0 };
    for (const l of lignes ?? []) {
      if (repartition[l.poste] !== undefined) repartition[l.poste]++;
    }

    setStats({
      totalCollaborateurs,
      collaborateursActifs,
      planningsSemaine: planningsCount ?? 0,
      totalRayons: rayonsCount ?? 0,
      repartitionPostes: repartition,
      rayonsActifs,
    });
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
      </div>
    );
  }

  if (!stats) return null;

  const totalPostes = Object.values(stats.repartitionPostes).reduce((a, b) => a + b, 0);

  return (
    <div className="space-y-6">

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Collaborateurs actifs"
          value={stats.collaborateursActifs}
          sub={`sur ${stats.totalCollaborateurs} total`}
          color="bg-blue-50 text-blue-600"
          icon={Users}
        />
        <StatCard
          label="Plannings cette semaine"
          value={stats.planningsSemaine}
          sub={`sur ${stats.totalRayons} rayon(s)`}
          color="bg-emerald-50 text-emerald-600"
          icon={Calendar}
        />
        <StatCard
          label="Rayons actifs"
          value={stats.totalRayons}
          sub="sur le périmètre"
          color="bg-amber-50 text-amber-600"
          icon={BarChart3}
        />
        <StatCard
          label="Taux de planification"
          value={stats.totalRayons > 0 ? `${Math.round((stats.planningsSemaine / stats.totalRayons) * 100)}%` : '—'}
          sub="cette semaine"
          color="bg-purple-50 text-purple-600"
          icon={TrendingUp}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Répartition postes */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-5">Répartition des postes — semaine en cours</h3>
          {totalPostes === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucun planning cette semaine.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(stats.repartitionPostes).map(([poste, nb]) => {
                const pct = totalPostes > 0 ? Math.round((nb / totalPostes) * 100) : 0;
                return (
                  <div key={poste}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700">{POSTE_LABEL[poste]} ({poste})</span>
                      <span className="text-gray-500">{nb} — {pct}%</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${POSTE_COLOR[poste]} transition-all`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top rayons */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h3 className="font-semibold text-gray-900 mb-5">Collaborateurs par rayon</h3>
          {stats.rayonsActifs.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Aucun collaborateur affecté.</p>
          ) : (
            <div className="space-y-3">
              {stats.rayonsActifs.map((r, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 bg-blue-50 rounded-lg flex items-center justify-center text-xs font-bold text-blue-600">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium text-gray-700 truncate">{r.nom}</span>
                      <span className="text-gray-500 shrink-0 ml-2">{r.nb} collab.</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 rounded-full"
                        style={{ width: `${Math.round((r.nb / stats.collaborateursActifs) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Résumé semaine */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <Calendar className="w-5 h-5 opacity-80" />
          <h3 className="font-semibold">Semaine en cours</h3>
        </div>
        <p className="text-blue-100 text-sm">
          {stats.planningsSemaine === 0
            ? 'Aucun planning créé cette semaine. Rendez-vous dans l\'onglet Planning pour commencer.'
            : `${stats.planningsSemaine} planning(s) créé(s) sur ${stats.totalRayons} rayon(s). ${
                stats.planningsSemaine < stats.totalRayons
                  ? `${stats.totalRayons - stats.planningsSemaine} rayon(s) sans planning.`
                  : 'Tous les rayons sont planifiés ✓'
              }`
          }
        </p>
      </div>
    </div>
  );
}
