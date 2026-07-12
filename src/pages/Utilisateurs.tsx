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
  departement_ids: string[];
  rayon_ids: string[];
}

interface FormData {
  email: string;
  password: string;
  nom: string;
  prenom: string;
  role: Role;
  departement_ids: string[];
  rayon_ids: string[];
}

const EMPTY_FORM: FormData = {
  email: '',
  password: '',
  nom: '',
  prenom: '',
  role: 'chef_rayon',
  departement_ids: [],
  rayon_ids: [],
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
      supabase.from('profiles').select('*').order('nom'),
      supabase.from('departements').select('*').order('nom'),
      supabase.from('rayons').select('*').order('nom'),
    ]);
    setUtilisateurs(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((users ?? []) as any[]).map(u => ({
        ...u,
        departement_ids: u.departement_ids ?? [],
        rayon_ids: u.rayon_ids ?? [],
      })) as Utilisateur[]
    );
    setDepartements((deps as Departement[]) ?? []);
    setRayons((rays as Rayon[]) ?? []);
    setLoading(false);
  }

  function depNom(id: string): string {
    return departements.find(d => d.id === id)?.nom ?? '—';
  }
  function rayonNom(id: string): string {
    return rayons.find(r => r.id === id)?.nom ?? '—';
  }

  function handleRoleChange(role: Role) {
    setForm(f => ({ ...f, role, departement_ids: [], rayon_ids: [] }));
  }

  function toggleDepartement(depId: string) {
    setForm(f => {
      const already = f.departement_ids.includes(depId);
      const departement_ids = already ? f.departement_ids.filter(id => id !== depId) : [...f.departement_ids, depId];
      // Un rayon dont le département n'est plus sélectionné n'a plus de sens pour un chef de rayon
      const rayon_ids = f.rayon_ids.filter(rid => {
        const r = rayons.find(x => x.id === rid);
        return r ? departement_ids.includes(r.departement_id) : false;
      });
      return { ...f, departement_ids, rayon_ids };
    });
  }

  function toggleRayon(rayonId: string) {
    setForm(f => ({
      ...f,
      rayon_ids: f.rayon_ids.includes(rayonId)
        ? f.rayon_ids.filter(id => id !== rayonId)
        : [...f.rayon_ids, rayonId],
    }));
  }

  function openAdd() {
    setForm(EMPTY_FORM);
    setEditId(null);
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
      departement_ids: u.departement_ids,
      rayon_ids: u.rayon_ids,
    });
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
    if (form.role === 'chef_departement' && form.departement_ids.length === 0) {
      setError('Sélectionnez au moins un département.');
      return;
    }
    if (form.role === 'chef_rayon' && form.rayon_ids.length === 0) {
      setError('Sélectionnez au moins un rayon.');
      return;
    }
    setSaving(true);

    if (editId) {
      // Modification du profil uniquement
      const { error: err } = await supabase.from('profiles').update({
        nom: form.nom.trim().toUpperCase(),
        prenom: form.prenom.trim(),
        role: form.role,
        departement_ids: form.departement_ids,
        rayon_ids: form.rayon_ids,
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
            departement_ids: form.departement_ids,
            rayon_ids: form.rayon_ids,
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
                  {u.departement_ids.map(id => (
                    <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {depNom(id)}
                    </span>
                  ))}
                  {u.rayon_ids.map(id => (
                    <span key={id} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      {rayonNom(id)}
                    </span>
                  ))}
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
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {form.role === 'chef_departement' ? 'Départements *' : 'Départements (pour filtrer les rayons)'}
                  </label>
                  <p className="text-[11px] text-gray-400 mb-2">
                    Sélectionnez plusieurs départements si cette personne en gère plus d'un.
                  </p>
                  <div className="border border-gray-200 rounded-xl max-h-40 overflow-y-auto divide-y divide-gray-50">
                    {departements.map(d => (
                      <label key={d.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={form.departement_ids.includes(d.id)}
                          onChange={() => toggleDepartement(d.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {d.nom}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {needsRayon && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Rayons *</label>
                  <p className="text-[11px] text-gray-400 mb-2">
                    Sélectionnez plusieurs rayons si cette personne en gère plus d'un.
                  </p>
                  {form.departement_ids.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">Choisissez d'abord un ou plusieurs départements.</p>
                  ) : (
                    <div className="border border-gray-200 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50">
                      {rayons.filter(r => form.departement_ids.includes(r.departement_id)).map(r => (
                        <label key={r.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                          <input
                            type="checkbox"
                            checked={form.rayon_ids.includes(r.id)}
                            onChange={() => toggleRayon(r.id)}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          {r.nom}
                        </label>
                      ))}
                    </div>
                  )}
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
