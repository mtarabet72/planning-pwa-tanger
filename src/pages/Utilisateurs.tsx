import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, X, Check, UserCog } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { Departement, Rayon, Role } from '../types';
import { ROLE_LABELS } from '../types';

interface Utilisateur {
  id: string;
  nom: string;
  prenom: string;
  role: Role;
  actif: boolean;
  departement_id: string | null;
  rayon_id: string | null;
  departements?: { nom: string };
  rayons?: { nom: string };
}

interface FormData {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  role: Role;
  departement_id: string;
  rayon_id: string;
}

const EMPTY_FORM: FormData = {
  email: '',
  password: '',
  nom: '',
  prenom: '',
  role: 'chef_rayon',
  departement_id: '',
  rayon_id: '',
};

const ROLE_COLORS: Record<Role, string> = {
  administrateur: 'bg-purple-50 text-purple-700',
  chef_departement: 'bg-blue-50 text-blue-700',
  chef_rayon: 'bg-emerald-50 text-emerald-700',
};

export default function Utilisateurs() {
  const [utilisateurs, setUtilisateurs] = useState<Utilisateur[]>([]);
  const [departements, setDepartements] = useState<Departement[]>([]);
  const [rayons, setRayons] = useState<Rayon[]>([]);
  const [rayonsFiltres, setRayonsFiltres] = useState<Rayon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { loadAll(); }, []);

  async function loadAll() {
    setLoading(true);
    const [{ data: users }, { data: deps }, { data: rays }] = await Promise.all([
      supabase.from('profiles').select('*, departements(nom), rayons(nom)').order('nom'),
      supabase.from('departements').select('*').order('nom'),
      supabase.from('rayons').select('*').order('nom'),
    ]);
    setUtilisateurs((users as Utilisateur[]) ?? []);
    setDepartements((deps as Departement[]) ?? []);
    setRayons((rays as Rayon[]) ?? []);
    setLoading(false);
  }

  function handleRoleChange(role: Role) {
    setForm(f => ({ ...f, role, departement_id: '', rayon_id: '' }));
    setRayonsFiltres([]);
  }

  function handleDepChange(depId: string) {
    setForm(f => ({ ...f, departement_id: depId, rayon_id: '' }));
    setRayonsFiltres(rayons.filter(r => r.departement_id === depId));
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
    setRayonsFiltres([]);
    setError(null);
    setShowForm(true);
  }

  function openEdit(u: Utilisateur) {
    setForm({
      email: '',
      password: '',
      nom: u.nom,
      prenom: u.prenom,
      role: u.role,
      departement_id: u.departement_id ?? '',
      rayon_id: u.rayon_id ?? '',
    });
    setRayonsFiltres(rayons.filter(r => r.departement_id === (u.departement_id ?? '')));
    setEditId(u.id);
    setError(null);
    setShowForm(true);
  }

  async function handleSave() {
    setError(null);
    if (!form.nom) { setError('Le nom est obligatoire.'); return; }
    if (!editId && (!form.email || !form.password)) {
      setError('Email et mot de passe obligatoires pour un nouveau compte.');
      return;
    }
    setSaving(true);

    if (editId) {
      // Modification du profil uniquement
      const { error: err } = await supabase.from('profiles').update({
        nom: form.nom.trim().toUpperCase(),
        prenom: form.prenom.trim(),
        role: form.role,
        departement_id: form.departement_id || null,
        rayon_id: form.rayon_id || null,
      }).eq('id', editId);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      // Création via Edge Function
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/dynamic-worker`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            email: form.email.trim(),
            password: form.password,
            nom: form.nom.trim().toUpperCase(),
            prenom: form.prenom.trim(),
            role: form.role,
            departement_id: form.departement_id || null,
            rayon_id: form.rayon_id || null,
          }),
        }
      );
      const result = await res.json();
      if (!res.ok || result.error) {
        setError(result.error ?? 'Erreur lors de la création.');
        setSaving(false);
        return;
      }
    }

    setSaving(false);
    setShowForm(false);
    loadAll();
  }

  async function handleToggleActif(u: Utilisateur) {
    await supabase.from('profiles').update({ actif: !u.actif }).eq('id', u.id);
    loadAll();
  }

  async function handleDelete(id: string) {
    setDeleting(true);
    await supabase.from('profiles').delete().eq('id', id);
    setDeleting(false);
    setDeleteId(null);
    loadAll();
  }

  const needsDep = form.role === 'chef_departement' || form.role === 'chef_rayon';
  const needsRayon = form.role === 'chef_rayon';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-gray-500">{utilisateurs.length} utilisateur(s)</p>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-blue-700 transition"
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
        <div className="space-y-3">
          {utilisateurs.map(u => (
            <div key={u.id} className="bg-white rounded-2xl border border-gray-100 p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-50 rounded-full flex items-center justify-center shrink-0">
                <UserCog className="w-5 h-5 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{u.nom} {u.prenom}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_COLORS[u.role]}`}>
                    {ROLE_LABELS[u.role]}
                  </span>
                  {u.departements?.nom && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {u.departements.nom}
                    </span>
                  )}
                  {u.rayons?.nom && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {u.rayons.nom}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggleActif(u)}
                  className={`w-8 h-5 rounded-full transition-colors ${u.actif ? 'bg-emerald-500' : 'bg-gray-300'}`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full shadow mx-0.5 transition-transform ${u.actif ? 'translate-x-3' : ''}`} />
                </button>
                <button onClick={() => openEdit(u)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => setDeleteId(u.id)} className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal formulaire */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-screen overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-100 sticky top-0 bg-white">
              <h3 className="font-semibold text-lg">{editId ? 'Modifier' : 'Ajouter'} un utilisateur</h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {!editId && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="nom@marjane.ma"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe *</label>
                    <input
                      type="password"
                      value={form.password}
                      onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                      className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="minimum 6 caractères"
                    />
                  </div>
                </>
              )}
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Rôle *</label>
                <select
                  value={form.role}
                  onChange={e => handleRoleChange(e.target.value as Role)}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="chef_rayon">Chef de Rayon</option>
                  <option value="chef_departement">Chef de Département</option>
                  <option value="administrateur">Administrateur</option>
                </select>
              </div>
              {needsDep && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Département *</label>
                  <select
                    value={form.departement_id}
                    onChange={e => handleDepChange(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Sélectionner —</option>
                    {departements.map(d => <option key={d.id} value={d.id}>{d.nom}</option>)}
                  </select>
                </div>
              )}
              {needsRayon && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rayon *</label>
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
              )}
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
                disabled={saving}
                className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editId ? 'Modifier' : 'Créer le compte'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-semibold text-lg mb-2">Supprimer cet utilisateur ?</h3>
            <p className="text-sm text-gray-500 mb-6">Le profil sera supprimé. Le compte Auth restera dans Supabase.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteId(null)} className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 text-sm font-medium">
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
