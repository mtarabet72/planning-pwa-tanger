import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Search, Loader2, X, Check, Phone } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Departement, Rayon } from '../types';

type Fonction = 'employe' | 'chef_rayon' | 'assistante' | 'chef_departement';

const FONCTION_LABEL: Record<Fonction, string> = {
  employe: 'Employé',
  chef_rayon: 'Chef de Rayon',
  assistante: 'Assistante',
  chef_departement: 'Chef de Département',
};

const FONCTION_STYLE: Record<Fonction, string> = {
  employe: 'bg-gray-100 text-gray-600',
  chef_rayon: 'bg-purple-50 text-purple-700',
  assistante: 'bg-blue-50 text-blue-700',
  chef_departement: 'bg-amber-50 text-amber-700',
};

interface Collaborateur {
  id: string;
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string | null;
  fonction: Fonction;
  actif: boolean;
  departement_id: string | null;
  rayon_id: string | null;
  departements?: { nom: string };
  rayons?: { nom: string };
}

interface FormData {
  matricule: string;
  nom: string;
  prenom: string;
  telephone: string;
  fonction: Fonction;
  departement_id: string;
  rayon_id: string;
  actif: boolean;
}

const EMPTY_FORM: FormData = {
  matricule: '',
  nom: '',
  prenom: '',
  telephone: '',
  fonction: 'employe',
  departement_id: '',
  rayon_id: '',
  actif: true,
};

export default function Collaborateurs() {
  const [collaborateurs, setCollaborateurs] = useState<Collaborateur[]>([]);
  const [departements, setDepartements] = useState<Departement[]>([]);
  const [rayons, setRayons] = useState<Rayon[]>([]);
  const [rayonsFiltres, setRayonsFiltres] = useState<Rayon[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterDep, setFilterDep] = useState('');
  const [filterRayon, setFilterRayon] = useState('');
  const [filterFonction, setFilterFonction] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: cols }, { data: deps }, { data: rays }] = await Promise.all([
      supabase.from('collaborateurs').select('*, departements(nom), rayons(nom)').order('nom'),
      supabase.from('departements').select('*').order('nom'),
      supabase.from('rayons').select('*').order('nom'),
    ]);
    setCollaborateurs((cols as Collaborateur[]) ?? []);
    setDepartements((deps as Departement[]) ?? []);
    setRayons((rays as Rayon[]) ?? []);
    setLoading(false);
  }

  function handleDepChange(depId: string) {
    setForm(f => ({ ...f, departement_id: depId, rayon_id: '' }));
    setRayonsFiltres(rayons.filter(r => r.departement_id === depId));
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setRayonsFiltres([]);
    setShowForm(true);
  }

  function openEdit(c: Collaborateur) {
    setForm({
      matricule: c.matricule,
      nom: c.nom,
      prenom: c.prenom,
      telephone: c.telephone ?? '',
      fonction: c.fonction ?? 'employe',
      departement_id: c.departement_id ?? '',
      rayon_id: c.rayon_id ?? '',
      actif: c.actif,
    });
    setRayonsFiltres(rayons.filter(r => r.departement_id === (c.departement_id ?? '')));
    setEditId(c.id);
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.matricule || !form.nom) return;
    setSaving(true);
    const payload = {
      matricule: form.matricule.trim(),
      nom: form.nom.trim().toUpperCase(),
      prenom: form.prenom.trim(),
      telephone: form.telephone.trim() || null,
      fonction: form.fonction,
      departement_id: form.departement_id || null,
      rayon_id: form.rayon_id || null,
      actif: form.actif,
    };
    if (editId) {
      await supabase.from('collaborateurs').update(payload).eq('id', editId);
    } else {
      await supabase.from('collaborateurs').insert(payload);
    }
    setSaving(false);
    setShowForm(false);
    loadAll();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await supabase.from('collaborateurs').delete().eq('id', id);
    setDeleting(false);
    setDeleteId(null);
    loadAll();
  }

  const filtered = collaborateurs.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      c.nom.toLowerCase().includes(q) ||
      c.prenom.toLowerCase().includes(q) ||
      c.matricule.toLowerCase().includes(q) ||
      (c.telephone ?? '').toLowerCase().includes(q);
    const matchDep = !filterDep || c.departement_id === filterDep;
    const matchRayon = !filterRayon || c.rayon_id === filterRayon;
    const matchFonction = !filterFonction || c.fonction === filterFonction;
    return matchSearch && matchDep && matchRayon && matchFonction;
  });

  const filterRayons = filterDep ? rayons.filter(r => r.departement_id === filterDep) : [];

  return (
    <div className="space-y-4">

      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher nom, matricule, tél..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={filterDep}
          onChange={e => { setFilterDep(e.target.value); setFilterRayon(''); }}
          className="py-2.5 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Tous les départements</option>
          {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
        </select>
        {filterDep && (
          <select
            value={filterRayon}
            onChange={e => setFilterRayon(e.target.value)}
            className="py-2.5 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Tous les rayons</option>
            {filterRayons.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
          </select>
        )}
        <select
          value={filterFonction}
          onChange={e => setFilterFonction(e.target.value)}
          className="py-2.5 px-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Toutes fonctions</option>
          <option value="employe">Employé</option>
          <option value="chef_rayon">Chef de Rayon</option>
          <option value="assistante">Assistante</option>
          <option value="chef_departement">Chef de Département</option>
        </select>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition shrink-0"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      </div>

      <p className="text-xs text-gray-500">{filtered.length} collaborateur(s)</p>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400 text-sm">
          Aucun collaborateur trouvé.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Matricule</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Nom & Prénom</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Fonction</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs hidden md:table-cell">Téléphone</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs hidden sm:table-cell">Département</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs hidden sm:table-cell">Rayon</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Statut</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 transition">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{c.matricule}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{c.nom}</div>
                      <div className="text-xs text-gray-500">{c.prenom}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${FONCTION_STYLE[c.fonction ?? 'employe']}`}>
                        {FONCTION_LABEL[c.fonction ?? 'employe']}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden md:table-cell">
                      {c.telephone ? (
                        <a href={`tel:${c.telephone}`} className="flex items-center gap-1 text-blue-600 hover:underline">
                          <Phone className="w-3 h-3" />
                          {c.telephone}
                        </a>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden sm:table-cell">
                      {c.departements?.nom ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 hidden sm:table-cell">
                      {c.rayons?.nom ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${
                        c.actif ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {c.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => openEdit(c)}
                          className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(c.id)}
                          className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-lg">{editId ? 'Modifier' : 'Ajouter'} un collaborateur</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Matricule *</label>
                <input
                  type="text"
                  value={form.matricule}
                  onChange={e => setForm(f => ({ ...f, matricule: e.target.value }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ex: 10001"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Nom *</label>
                  <input
                    type="text"
                    value={form.nom}
                    onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="ALAMI"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Prénom</label>
                  <input
                    type="text"
                    value={form.prenom}
                    onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Mohamed"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Téléphone</label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="tel"
                    value={form.telephone}
                    onChange={e => setForm(f => ({ ...f, telephone: e.target.value }))}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="06 12 34 56 78"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fonction</label>
                <select
                  value={form.fonction}
                  onChange={e => setForm(f => ({ ...f, fonction: e.target.value as Fonction }))}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="employe">Employé</option>
                  <option value="chef_rayon">Chef de Rayon</option>
                  <option value="assistante">Assistante</option>
                  <option value="chef_departement">Chef de Département</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Département</label>
                <select
                  value={form.departement_id}
                  onChange={e => handleDepChange(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Sélectionner —</option>
                  {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rayon</label>
                <select
                  value={form.rayon_id}
                  onChange={e => setForm(f => ({ ...f, rayon_id: e.target.value }))}
                  disabled={!form.departement_id}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="">— Sélectionner —</option>
                  {rayonsFiltres.map(r => <option key={r.id} value={r.id}>{r.nom}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setForm(f => ({ ...f, actif: !f.actif }))}
                  className={`w-10 h-6 rounded-full transition-colors ${form.actif ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-4 h-4 bg-white rounded-full shadow mx-1 transition-transform ${form.actif ? 'translate-x-4' : ''}`} />
                </button>
                <span className="text-sm text-gray-600">Collaborateur actif</span>
              </div>
            </div>
            <div className="flex gap-3 p-6 pt-0">
              <button
                onClick={() => setShowForm(false)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.matricule || !form.nom}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editId ? 'Modifier' : 'Ajouter'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Supprimer ce collaborateur ?</h3>
            <p className="text-sm text-gray-500 mb-6">Cette action est irréversible.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium"
              >
                Annuler
              </button>
              <button
                onClick={() => handleDelete(deleteId)}
                disabled={deleting}
                className="flex-1 py-3 rounded-2xl bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
