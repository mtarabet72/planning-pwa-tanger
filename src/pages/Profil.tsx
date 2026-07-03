import { useState } from 'react';
import { Lock, Check, Loader2, Eye, EyeOff, User } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ROLE_LABELS } from '../types';

export default function Profil() {
  const { profile, session } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChangePassword() {
    setError(null);
    setSuccess(false);

    if (!newPassword || !confirmPassword) {
      setError('Tous les champs sont obligatoires.');
      return;
    }
    if (newPassword.length < 6) {
      setError('Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Le nouveau mot de passe doit être différent de l\'ancien.');
      return;
    }

    setSaving(true);

    // Vérifier l'ancien mot de passe en se reconnectant
    const email = session?.user?.email ?? '';
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password: currentPassword,
    });

    if (signInErr) {
      setError('Mot de passe actuel incorrect.');
      setSaving(false);
      return;
    }

    // Mettre à jour le mot de passe
    const { error: updateErr } = await supabase.auth.updateUser({
      password: newPassword,
    });

    setSaving(false);

    if (updateErr) {
      setError(updateErr.message);
      return;
    }

    setSuccess(true);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => setSuccess(false), 4000);
  }

  if (!profile) return null;

  const fullName = `${profile.prenom} ${profile.nom}`.trim();

  return (
    <div className="max-w-lg space-y-6">

      {/* Infos utilisateur */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
            <User className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 text-lg">{fullName}</h3>
            <p className="text-sm text-gray-500">{session?.user?.email}</p>
            <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-medium ${
              profile.role === 'administrateur'
                ? 'bg-purple-50 text-purple-700'
                : profile.role === 'chef_departement'
                ? 'bg-blue-50 text-blue-700'
                : 'bg-emerald-50 text-emerald-700'
            }`}>
              {ROLE_LABELS[profile.role]}
            </span>
          </div>
        </div>
      </div>

      {/* Changer mot de passe */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 bg-amber-50 rounded-xl flex items-center justify-center">
            <Lock className="w-5 h-5 text-amber-600" />
          </div>
          <h3 className="font-semibold text-gray-900">Changer le mot de passe</h3>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mot de passe actuel *</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nouveau mot de passe *</label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full px-4 py-2.5 pr-10 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="minimum 6 caractères"
              />
              <button
                type="button"
                onClick={() => setShowNew(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="mt-2 flex gap-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`h-1 flex-1 rounded-full ${
                    newPassword.length >= i * 3
                      ? newPassword.length >= 10 ? 'bg-emerald-500' : newPassword.length >= 6 ? 'bg-amber-400' : 'bg-red-400'
                      : 'bg-gray-200'
                  }`} />
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirmer le nouveau mot de passe *</label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className={`w-full px-4 py-2.5 pr-10 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  confirmPassword && confirmPassword !== newPassword
                    ? 'border-red-300 bg-red-50'
                    : confirmPassword && confirmPassword === newPassword
                    ? 'border-emerald-300 bg-emerald-50'
                    : 'border-gray-200'
                }`}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {confirmPassword && confirmPassword !== newPassword && (
              <p className="text-xs text-red-500 mt-1">Les mots de passe ne correspondent pas.</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 text-xs rounded-xl px-4 py-3">{error}</div>
          )}

          {success && (
            <div className="bg-emerald-50 text-emerald-700 text-xs rounded-xl px-4 py-3 flex items-center gap-2">
              <Check className="w-4 h-4" />
              Mot de passe modifié avec succès !
            </div>
          )}

          <button
            onClick={handleChangePassword}
            disabled={saving || !currentPassword || !newPassword || !confirmPassword}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-2xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
            {saving ? 'Modification en cours...' : 'Changer le mot de passe'}
          </button>
        </div>
      </div>
    </div>
  );
}
