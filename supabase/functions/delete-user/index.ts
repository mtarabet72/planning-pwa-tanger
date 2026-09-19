import { createClient } from 'npm:@supabase/supabase-js@2';
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json'
    }
  });
}
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') return new Response('ok', {
    headers: cors
  });
  if (req.method !== 'POST') return json({
    error: 'Méthode non autorisée'
  }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const authHeader = req.headers.get('Authorization') ?? '';
    // 1. Qui appelle ? (jeton de l'utilisateur connecté)
    const anon = createClient(url, Deno.env.get('SUPABASE_ANON_KEY'), {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });
    const { data: { user } } = await anon.auth.getUser();
    if (!user) return json({
      error: 'Non authentifié'
    }, 401);
    // 2. Est-il administrateur ? (clé service_role : ignore le RLS, ne sort jamais du serveur)
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (me?.role !== 'administrateur') return json({
      error: 'Réservé aux administrateurs'
    }, 403);
    // 3. Cibles
    const body = await req.json().catch(()=>({}));
    let cibles = [];
    if (body.all_non_admin === true) {
      const { data } = await admin.from('profiles').select('id').neq('role', 'administrateur');
      cibles = (data ?? []).map((p)=>p.id);
    } else if (typeof body.user_id === 'string' && body.user_id) {
      if (body.user_id === user.id) return json({
        error: 'Impossible de supprimer son propre compte'
      }, 400);
      const { data } = await admin.from('profiles').select('role').eq('id', body.user_id).maybeSingle();
      if (data?.role === 'administrateur') return json({
        error: 'Impossible de supprimer un administrateur'
      }, 400);
      cibles = [
        body.user_id
      ];
    } else {
      return json({
        error: 'Paramètre user_id ou all_non_admin requis'
      }, 400);
    }
    // 4. Suppression Auth puis profil (au cas où la clé étrangère n'est pas en cascade)
    let deleted = 0;
    const errors = [];
    for (const id of cibles){
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error && !/not found/i.test(error.message)) {
        errors.push(`${id}: ${error.message}`);
        continue;
      }
      await admin.from('profiles').delete().eq('id', id);
      deleted++;
    }
    return json({
      deleted,
      errors
    });
  } catch (e) {
    return json({
      error: e instanceof Error ? e.message : String(e)
    }, 500);
  }
});
