import { useState, type FormEvent } from 'react';
import { Lock, Mail, Loader2, ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

type View = 'login' | 'reset';

export default function Login() {
  const { signIn } = useAuth();
  const [view, setView] = useState<View>('login');

  // Login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Reset
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    const { error: signInError } = await signIn(email.trim(), password);
    setSubmitting(false);
    if (signInError) setError(signInError);
  }

  async function handleReset(e: FormEvent) {
    e.preventDefault();
    setResetError(null);
    setResetSubmitting(true);

    const { error: err } = await supabase.auth.resetPasswordForEmail(
      resetEmail.trim(),
      {
        redirectTo: `${window.location.origin}/planning-pwa-tanger`,
      }
    );

    setResetSubmitting(false);

    if (err) {
      setResetError('Erreur lors de l\'envoi. Vérifiez l\'adresse email.');
      return;
    }
    setResetSent(true);
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Logo */}
        <div className="flex items-center gap-3 justify-center mb-8">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-2xl">
            P
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
            <p className="text-sm text-gray-500">Marjane Tanger</p>
          </div>
        </div>

        {/* CONNEXION */}
        {view === 'login' && (
          <form
            onSubmit={handleLogin}
            className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-5"
          >
            <h2 className="text-xl font-semibold text-gray-900">Connexion</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse e-mail</label>
              <div className="relative">
                <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="nom@marjane.ma"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Mot de passe</label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Se connecter
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setView('reset'); setResetEmail(email); setResetError(null); setResetSent(false); }}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                Mot de passe oublié ?
              </button>
            </div>

            <p className="text-xs text-center text-gray-400">
              Les comptes sont créés par l'administrateur.
            </p>
          </form>
        )}

        {/* RÉINITIALISATION */}
        {view === 'reset' && (
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 space-y-5">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setView('login')}
                className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h2 className="text-xl font-semibold text-gray-900">Mot de passe oublié</h2>
            </div>

            {resetSent ? (
              <div className="text-center py-4 space-y-4">
                <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">Email envoyé !</p>
                  <p className="text-sm text-gray-500 mt-1">
                    Vérifiez votre boîte mail à <strong>{resetEmail}</strong> et cliquez sur le lien de réinitialisation.
                  </p>
                </div>
                <p className="text-xs text-gray-400">
                  Le lien expire dans 1 heure. Vérifiez aussi vos spams.
                </p>
                <button
                  onClick={() => setView('login')}
                  className="text-sm text-blue-600 font-medium hover:text-blue-700"
                >
                  Retour à la connexion
                </button>
              </div>
            ) : (
              <form onSubmit={handleReset} className="space-y-4">
                <p className="text-sm text-gray-500">
                  Entrez votre adresse email. Vous recevrez un lien pour réinitialiser votre mot de passe.
                </p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Adresse e-mail</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={e => setResetEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="nom@marjane.ma"
                    />
                  </div>
                </div>

                {resetError && (
                  <div className="bg-red-50 text-red-700 text-sm rounded-xl px-4 py-3">{resetError}</div>
                )}

                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-medium py-3 rounded-xl transition"
                >
                  {resetSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                  Envoyer le lien
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setView('login')}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Retour à la connexion
                  </button>
                </div>
              </form>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
