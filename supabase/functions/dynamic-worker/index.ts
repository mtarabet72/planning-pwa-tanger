import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' }
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader) return json({ error: 'Non autorise' }, 401);

  const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
  const caller = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user } } = await caller.auth.getUser();
  if (!user) return json({ error: 'Non autorise' }, 401);

  const { data: prof } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (prof?.role !== 'administrateur') return json({ error: 'Interdit' }, 403);

  const body = await req.json();
  // departement_ids / rayon_ids : tableaux, alignés sur le modèle multi-rayon / multi-département
  // actuel (profiles.departement_ids / profiles.rayon_ids). Les anciennes colonnes singulières
  // departement_id / rayon_id ne sont plus utilisées par l'application.
  const { email, password, nom, prenom, role, departement_ids, rayon_ids } = body;

  const { data: created, error: err } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nom, prenom }
  });
  if (err) return json({ error: err.message }, 400);

  const newId = created.user.id;
  const { error: profileErr } = await admin.from('profiles').upsert({
    id: newId,
    nom,
    prenom,
    role,
    departement_ids: departement_ids ?? [],
    rayon_ids: rayon_ids ?? [],
    actif: true
  });
  if (profileErr) {
    // Le compte de connexion existe déjà à ce stade ; on le supprime pour éviter un compte orphelin
    // sans profil exploitable, et on renvoie l'erreur réelle plutôt qu'un faux succès.
    await admin.auth.admin.deleteUser(newId);
    return json({ error: `Compte créé mais profil invalide : ${profileErr.message}` }, 400);
  }

  return json({ success: true, id: newId });
});