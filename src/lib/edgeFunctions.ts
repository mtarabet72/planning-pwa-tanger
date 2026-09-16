import { supabase } from './supabase';

/**
 * Appelle une Edge Function Supabase avec le jeton de l'utilisateur connecté.
 * Lève une erreur lisible si la fonction renvoie un statut d'erreur ou un champ `error`.
 */
export async function appelerFonction<T = unknown>(nom: string, body: unknown): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Session expirée, reconnecte-toi.');

  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${nom}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok || result?.error) {
    throw new Error(result?.error ?? `Erreur ${res.status} lors de l'appel à ${nom}`);
  }
  return result as T;
}
