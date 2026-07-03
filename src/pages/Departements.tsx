import { useState, useEffect } from 'react';
import { Plus, Pencil, Loader2, X, Check, Building2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface Departement {
  id: string;
  code: string;
  nom: string;
  nb_rayons?: number;
  nb_collaborateurs?: number;
}

interface FormData {
  code: string;
  nom: string;
}

const EMPTY_FORM: FormData = { code: '', nom: '' };

export default function Departements() {
  const [departements, setDepartements] = useState<Departement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);

    const { data: deps } = await supabase
      .from('departements').select('*').order('nom');

    const { data: rayons } = await supabase
      .from('rayons').select('id, departement_id').eq('actif', true);

    const { data: cols } = await supabase
      .from('collaborateurs').select('id, rayon_id, rayons(departement_id)').eq('actif', true);

    const rayonMap: Record<string, number> = {};
    for (const r of (rayons ?? []) as { id: string; departement_id: string }[]) {
      rayonMap[r.departement_id] = (rayonMap[r.departement_id] ?? 0) + 1;
    }

    const colMap: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const c of (cols ?? []) as any[]) {
      const depId = c.rayons?.departement_id;
      if (depId) colMap[depId] = (colMap[depId] ?? 0) + 1;
    }

    const enriched = (deps ?? []).map(d => ({
      ...d,
      nb_rayons: rayonMap[d.id] ?? 0,
      nb_collaborateurs: colMap[d.id] ?? 0,
    }));

    setDepartements(enriched as Departement[]);
    setLoading(false);
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(d: Departement) {
    setForm({ code: d.code, nom: d.nom });
    setEditId(d.id);
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.code.trim() || !form.nom.trim()) {
      setError('Le code et le nom sont obligatoires.');
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      code: form.code.trim().toUpperCase(),
      nom: form.nom.trim().toUpperCase(),
    };

    if (editId) {
      const { error: err } = await supabase
        .from('departements').update(payload).eq('id', editId);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      const { error: err } = await supabase
        .from('departements').insert(payload);
      if (err) {
        setError(err.message.includes('unique') ? 'Ce code département existe déjà.' : err.message);
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    loadAll();
  }

  const totalRayons = departements.reduce((a: number, d: Departement) => a + (d.nb_rayons ?? 0), 0);
  const totalCols = departements.reduce((a: number, d: Departement) => a + (d.nb_collaborateurs ?? 0), 0);

  return (
    <div className="space-y-4">

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
          <div className="text-2xl font-bold text-purple-600">{departements.length}</div>
          <div className="text-xs text-gray-500 mt-1">Départements</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
          <div className="text-2xl font-bold text-blue-600">{totalRayons}</div>
          <div className="text-xs text-gray-500 mt-1">Rayons actifs</div>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-gray-100 text-center">
          <div className="text-2xl font-bold text-emerald-600">{totalCols}</div>
          <div className="text-xs text-gray-500 mt-1">Collaborateurs</div>
        </div>
      </div>

      {/* Bouton ajouter */}
      <div className="flex justify-end">
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Ajouter un département
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {departements.map(d => (
            <div key={d.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-50 rounded-2xl flex items-center justify-center shrink-0">
                <Building2 className="w-6 h-6 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg">{d.code}</span>
                  <span className="font-semibold text-gray-900">{d.nom}</span>
                </div>
                <div className="flex gap-4 mt-1">
                  <span className="text-xs text-gray-400">{d.nb_rayons} rayon(s)</span>
                  <span className="text-xs text-gray-400">{d.nb_collaborateurs} collaborateur(s)</span>
                </div>
              </div>
              <button
                onClick={() => openEdit(d)}
                className="p-2 hover:bg-blue-50 text-blue-600 rounded-xl transition shrink-0"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
          ))}

          {departements.length === 0 && (
            <div className="text-center py-16 text-gray-400 text-sm">
              Aucun département. Appuie sur "Ajouter" pour commencer.
            </div>
          )}
        </div>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h3 className="font-semibold text-lg">
                {editId ? 'Modifier' : 'Ajouter'} un département
              </h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Code *
                  <span className="text-gray-400 font-normal ml-1">(ex: PGC, APLS, MARCHE)</span>
                </label>
                <input
                  type="text"
                  value={form.code}
                  onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ex: TEXTILE"
                  maxLength={20}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                <input
                  type="text"
                  value={form.nom}
                  onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ex: TEXTILE"
                />
              </div>
              {error && (
                <div className="bg-red-50 text-red-700 text-xs rounded-xl px-4 py-3">{error}</div>
              )}
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
                disabled={saving || !form.code || !form.nom}
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
