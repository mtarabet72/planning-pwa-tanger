import { useState, useEffect } from 'react';
import { Plus, Pencil, Loader2, X, Check, ToggleLeft, ToggleRight } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Departement {
  id: string;
  nom: string;
  code: string;
}

interface Rayon {
  id: string;
  numero: string | null;
  nom: string;
  departement_id: string;
  actif: boolean;
  nb_collaborateurs?: number;
}

interface FormData {
  numero: string;
  nom: string;
  departement_id: string;
  actif: boolean;
}

const EMPTY_FORM: FormData = { numero: '', nom: '', departement_id: '', actif: true };

export default function Rayons() {
  const [departements, setDepartements] = useState<Departement[]>([]);
  const [rayons, setRayons] = useState<Rayon[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDep, setFilterDep] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: deps }, { data: rays }, { data: cols }] = await Promise.all([
      supabase.from('departements').select('*').order('nom'),
      supabase.from('rayons').select('*').order('nom'),
      supabase.from('collaborateurs').select('rayon_id').eq('actif', true),
    ]);

    const countMap: Record<string, number> = {};
    for (const c of cols ?? []) {
      if (c.rayon_id) countMap[c.rayon_id] = (countMap[c.rayon_id] ?? 0) + 1;
    }

    const enriched = (rays ?? []).map(r => ({ ...r, nb_collaborateurs: countMap[r.id] ?? 0 }));
    setDepartements((deps as Departement[]) ?? []);
    setRayons(enriched as Rayon[]);
    setLoading(false);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setShowForm(true);
  }

  function openEdit(r: Rayon) {
    setForm({ numero: r.numero ?? '', nom: r.nom, departement_id: r.departement_id, actif: r.actif });
    setEditId(r.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.nom || !form.departement_id) return;
    setSaving(true);
    const payload = {
      numero: form.numero || null,
      nom: form.nom.trim().toUpperCase(),
      departement_id: form.departement_id,
      actif: form.actif,
    };
    if (editId) {
      await supabase.from('rayons').update(payload).eq('id', editId);
    } else {
      await supabase.from('rayons').insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    loadAll();
  }

  async function handleToggle(r: Rayon) {
    await supabase.from('rayons').update({ actif: !r.actif }).eq('id', r.id);
    loadAll();
  }

  const filtered = rayons.filter(r => !filterDep || r.departement_id === filterDep);

  // Grouper par département
  const grouped: Record<string, { dep: Departement; rayons: Rayon[] }> = {};
  for (const r of filtered) {
    if (!grouped[r.departement_id]) {
      const dep = departements.find(d => d.id === r.departement_id);
      if (dep) grouped[r.departement_id] = { dep, rayons: [] };
    }
    if (grouped[r.departement_id]) grouped[r.departement_id].rayons.push(r);
  }

  const totalActifs = rayons.filter(r => r.actif).length;
  const totalInactifs = rayons.filter(r => !r.actif).length;
  const totalCols = rayons.reduce((acc, r) => acc + (r.nb_collaborateurs ?? 0), 0);

  return (
    <div className="space-y-4">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
          <div className="text-2xl font-bold text-blue-600">{rayons.length}</div>
          <div className="text-xs text-gray-500 mt-1">Total rayons</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
          <div className="text-2xl font-bold text-emerald-600">{totalActifs}</div>
          <div className="text-xs text-gray-500 mt-1">Actifs</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
          <div className="text-2xl font-bold text-amber-600">{totalCols}</div>
          <div className="text-xs text-gray-500 mt-1">Collaborateurs</div>
        </div>
      </div>

      {/* Barre d'outils */}
      <div className="flex gap-3 flex-wrap">
        <select
          value={filterDep}
          onChange={e => setFilterDep(e.target.value)}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les départements</option>
          {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.values(grouped).map(({ dep, rayons: depRayons }) => (
            <div key={dep.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-lg">{dep.code}</span>
                  <span className="font-semibold text-blue-900 text-sm">{dep.nom}</span>
                </div>
                <span className="text-xs text-blue-600">{depRayons.length} rayon(s)</span>
              </div>
              <div className="divide-y divide-gray-50">
                {depRayons.map(r => (
                  <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition">
                    {r.numero && (
                      <span className="text-xs font-mono text-gray-400 w-8 shrink-0">{r.numero}</span>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm font-medium ${!r.actif ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        {r.nom}
                      </span>
                      {(r.nb_collaborateurs ?? 0) > 0 && (
                        <span className="ml-2 text-xs text-gray-400">{r.nb_collaborateurs} collab.</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {r.actif ? 'Actif' : 'Inactif'}
                      </span>
                      <button
                        onClick={() => handleToggle(r)}
                        className={`p-1.5 rounded-lg transition ${r.actif ? 'hover:bg-red-50 text-emerald-600' : 'hover:bg-emerald-50 text-gray-400'}`}
                        title={r.actif ? 'Désactiver' : 'Activer'}
                      >
                        {r.actif
                          ? <ToggleRight className="w-5 h-5" />
                          : <ToggleLeft className="w-5 h-5" />
                        }
                      </button>
                      <button
                        onClick={() => openEdit(r)}
                        className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {Object.keys(grouped).length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">Aucun rayon trouvé.</div>
          )}
        </div>
      )}

      {/* Stats inactifs */}
      {totalInactifs > 0 && (
        <p className="text-xs text-gray-400 text-center">{totalInactifs} rayon(s) inactif(s) masqué(s) dans le planning</p>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-semibold text-lg">{editId ? 'Modifier' : 'Ajouter'} un rayon</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Département *</label>
                <select
                  value={form.departement_id}
                  onChange={e => setForm(f => ({ ...f, departement_id: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Sélectionner —</option>
                  {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">N° Rayon</label>
                  <input
                    type="text"
                    value={form.numero}
                    onChange={e => setForm(f => ({ ...f, numero: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ex: 11"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ex: EPICERIE"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm(f => ({ ...f, actif: !f.actif }))}
                  className={`w-10 h-6 rounded-full transition-colors ${form.actif ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${form.actif ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-600">Rayon actif</span>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.nom || !form.departement_id}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editId ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
