


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."user_role" AS ENUM (
    'administrateur',
    'chef_departement',
    'chef_rayon'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_departement_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select departement_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_departement_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_departement_ids"() RETURNS "uuid"[]
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select coalesce((select departement_ids::uuid[] from profiles where id = auth.uid()), '{}'::uuid[]);
$$;


ALTER FUNCTION "public"."current_departement_ids"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_rayon_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select rayon_id from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_rayon_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select role from public.profiles where id = auth.uid();
$$;


ALTER FUNCTION "public"."current_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.profiles (id, nom, prenom, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'nom', ''), coalesce(new.raw_user_meta_data->>'prenom', ''), 'chef_rayon')
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'administrateur'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."protect_profile_columns"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or is_admin() then return new; end if;
  if new.role is distinct from old.role
     or new.rayon_ids is distinct from old.rayon_ids
     or new.departement_ids is distinct from old.departement_ids
     or new.actif is distinct from old.actif then
    raise exception 'Modification du rôle ou des affectations réservée à un administrateur';
  end if;
  return new;
end $$;


ALTER FUNCTION "public"."protect_profile_columns"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."collaborateurs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "matricule" "text" NOT NULL,
    "nom" "text" NOT NULL,
    "prenom" "text" NOT NULL,
    "departement_id" "uuid",
    "rayon_id" "uuid",
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "telephone" "text",
    "fonction" "text" DEFAULT 'employe'::"text",
    "rayons_geres_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "departements_geres_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    CONSTRAINT "fonction_valide" CHECK (("fonction" = ANY (ARRAY['employe'::"text", 'chef_rayon'::"text", 'assistante'::"text", 'chef_departement'::"text"])))
);


ALTER TABLE "public"."collaborateurs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."departements" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "nom" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."departements" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permanence_horaires" (
    "poste" "text" NOT NULL,
    "heure_debut" "text" NOT NULL,
    "heure_fin" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "permanence_horaires_poste_check" CHECK (("poste" = ANY (ARRAY['M'::"text", 'T'::"text", 'S'::"text"])))
);


ALTER TABLE "public"."permanence_horaires" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permanence_lignes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planning_id" "uuid" NOT NULL,
    "collaborateur_id" "uuid" NOT NULL,
    "jour" "date" NOT NULL,
    "poste" "text" DEFAULT 'R'::"text" NOT NULL,
    CONSTRAINT "poste_perm_valide" CHECK (("poste" = ANY (ARRAY['M'::"text", 'T'::"text", 'S'::"text", 'R'::"text", 'C'::"text", 'MAL'::"text", 'AT'::"text", 'FOR'::"text", 'HN'::"text"])))
);


ALTER TABLE "public"."permanence_lignes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."permanence_membres" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planning_id" "uuid" NOT NULL,
    "collaborateur_id" "uuid" NOT NULL
);


ALTER TABLE "public"."permanence_membres" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planning_encadrement_lignes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planning_id" "uuid" NOT NULL,
    "collaborateur_id" "uuid" NOT NULL,
    "jour" "date" NOT NULL,
    "poste" "text" DEFAULT 'R'::"text" NOT NULL,
    CONSTRAINT "poste_enc_valide" CHECK (("poste" = ANY (ARRAY['M'::"text", 'T'::"text", 'S'::"text", 'R'::"text", 'C'::"text", 'MAL'::"text", 'AT'::"text", 'FOR'::"text", 'HN'::"text"])))
);


ALTER TABLE "public"."planning_encadrement_lignes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planning_lignes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "planning_id" "uuid" NOT NULL,
    "collaborateur_id" "uuid" NOT NULL,
    "jour" "date" NOT NULL,
    "poste" "text" DEFAULT 'R'::"text" NOT NULL,
    CONSTRAINT "poste_valide" CHECK (("poste" = ANY (ARRAY['M'::"text", 'T'::"text", 'S'::"text", 'R'::"text", 'C'::"text", 'MAL'::"text", 'AT'::"text", 'FOR'::"text", 'HN'::"text"])))
);


ALTER TABLE "public"."planning_lignes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plannings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "rayon_id" "uuid" NOT NULL,
    "semaine_debut" "date" NOT NULL,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commentaire" "text",
    "valide_par" "uuid",
    "valide_at" timestamp with time zone,
    CONSTRAINT "plannings_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'soumis_dept'::"text", 'soumis_admin'::"text", 'valide'::"text", 'rejete'::"text"])))
);


ALTER TABLE "public"."plannings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plannings_encadrement" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "departement_id" "uuid" NOT NULL,
    "semaine_debut" "date" NOT NULL,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "commentaire" "text",
    "valide_par" "uuid",
    "valide_at" timestamp with time zone,
    CONSTRAINT "plannings_encadrement_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'soumis'::"text", 'valide'::"text", 'rejete'::"text"])))
);


ALTER TABLE "public"."plannings_encadrement" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plannings_permanence" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "semaine_debut" "date" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "type" "text" DEFAULT 'permanence'::"text" NOT NULL,
    "statut" "text" DEFAULT 'brouillon'::"text" NOT NULL,
    "valide_par" "uuid",
    "valide_at" timestamp with time zone,
    CONSTRAINT "plannings_permanence_statut_check" CHECK (("statut" = ANY (ARRAY['brouillon'::"text", 'valide'::"text"]))),
    CONSTRAINT "type_valide" CHECK (("type" = ANY (ARRAY['permanence'::"text", 'direction'::"text"])))
);


ALTER TABLE "public"."plannings_permanence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "nom" "text" NOT NULL,
    "prenom" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'chef_rayon'::"public"."user_role" NOT NULL,
    "departement_id" "uuid",
    "rayon_id" "uuid",
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "rayon_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "departement_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rayons" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "numero" "text",
    "nom" "text" NOT NULL,
    "departement_id" "uuid" NOT NULL,
    "actif" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."rayons" OWNER TO "postgres";


ALTER TABLE ONLY "public"."collaborateurs"
    ADD CONSTRAINT "collaborateurs_matricule_key" UNIQUE ("matricule");



ALTER TABLE ONLY "public"."collaborateurs"
    ADD CONSTRAINT "collaborateurs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."departements"
    ADD CONSTRAINT "departements_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."departements"
    ADD CONSTRAINT "departements_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permanence_horaires"
    ADD CONSTRAINT "permanence_horaires_pkey" PRIMARY KEY ("poste");



ALTER TABLE ONLY "public"."permanence_lignes"
    ADD CONSTRAINT "permanence_lignes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permanence_lignes"
    ADD CONSTRAINT "permanence_lignes_planning_id_collaborateur_id_jour_key" UNIQUE ("planning_id", "collaborateur_id", "jour");



ALTER TABLE ONLY "public"."permanence_membres"
    ADD CONSTRAINT "permanence_membres_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."permanence_membres"
    ADD CONSTRAINT "permanence_membres_planning_id_collaborateur_id_key" UNIQUE ("planning_id", "collaborateur_id");



ALTER TABLE ONLY "public"."planning_encadrement_lignes"
    ADD CONSTRAINT "planning_encadrement_lignes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planning_encadrement_lignes"
    ADD CONSTRAINT "planning_encadrement_lignes_planning_id_collaborateur_id_jo_key" UNIQUE ("planning_id", "collaborateur_id", "jour");



ALTER TABLE ONLY "public"."planning_lignes"
    ADD CONSTRAINT "planning_lignes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planning_lignes"
    ADD CONSTRAINT "planning_lignes_planning_id_collaborateur_id_jour_key" UNIQUE ("planning_id", "collaborateur_id", "jour");



ALTER TABLE ONLY "public"."plannings_encadrement"
    ADD CONSTRAINT "plannings_encadrement_departement_id_semaine_debut_key" UNIQUE ("departement_id", "semaine_debut");



ALTER TABLE ONLY "public"."plannings_encadrement"
    ADD CONSTRAINT "plannings_encadrement_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plannings_permanence"
    ADD CONSTRAINT "plannings_permanence_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plannings_permanence"
    ADD CONSTRAINT "plannings_permanence_unique" UNIQUE ("semaine_debut", "type");



ALTER TABLE ONLY "public"."plannings"
    ADD CONSTRAINT "plannings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plannings"
    ADD CONSTRAINT "plannings_rayon_id_semaine_debut_key" UNIQUE ("rayon_id", "semaine_debut");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rayons"
    ADD CONSTRAINT "rayons_departement_id_nom_key" UNIQUE ("departement_id", "nom");



ALTER TABLE ONLY "public"."rayons"
    ADD CONSTRAINT "rayons_pkey" PRIMARY KEY ("id");



CREATE OR REPLACE TRIGGER "trg_protect_profile_columns" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."protect_profile_columns"();



ALTER TABLE ONLY "public"."collaborateurs"
    ADD CONSTRAINT "collaborateurs_departement_id_fkey" FOREIGN KEY ("departement_id") REFERENCES "public"."departements"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."collaborateurs"
    ADD CONSTRAINT "collaborateurs_rayon_id_fkey" FOREIGN KEY ("rayon_id") REFERENCES "public"."rayons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."permanence_lignes"
    ADD CONSTRAINT "permanence_lignes_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "public"."collaborateurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permanence_lignes"
    ADD CONSTRAINT "permanence_lignes_planning_id_fkey" FOREIGN KEY ("planning_id") REFERENCES "public"."plannings_permanence"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permanence_membres"
    ADD CONSTRAINT "permanence_membres_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "public"."collaborateurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."permanence_membres"
    ADD CONSTRAINT "permanence_membres_planning_id_fkey" FOREIGN KEY ("planning_id") REFERENCES "public"."plannings_permanence"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_encadrement_lignes"
    ADD CONSTRAINT "planning_encadrement_lignes_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "public"."collaborateurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_encadrement_lignes"
    ADD CONSTRAINT "planning_encadrement_lignes_planning_id_fkey" FOREIGN KEY ("planning_id") REFERENCES "public"."plannings_encadrement"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_lignes"
    ADD CONSTRAINT "planning_lignes_collaborateur_id_fkey" FOREIGN KEY ("collaborateur_id") REFERENCES "public"."collaborateurs"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planning_lignes"
    ADD CONSTRAINT "planning_lignes_planning_id_fkey" FOREIGN KEY ("planning_id") REFERENCES "public"."plannings"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plannings"
    ADD CONSTRAINT "plannings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plannings_encadrement"
    ADD CONSTRAINT "plannings_encadrement_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plannings_encadrement"
    ADD CONSTRAINT "plannings_encadrement_departement_id_fkey" FOREIGN KEY ("departement_id") REFERENCES "public"."departements"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plannings_encadrement"
    ADD CONSTRAINT "plannings_encadrement_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plannings_permanence"
    ADD CONSTRAINT "plannings_permanence_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plannings_permanence"
    ADD CONSTRAINT "plannings_permanence_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."plannings"
    ADD CONSTRAINT "plannings_rayon_id_fkey" FOREIGN KEY ("rayon_id") REFERENCES "public"."rayons"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plannings"
    ADD CONSTRAINT "plannings_valide_par_fkey" FOREIGN KEY ("valide_par") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_departement_id_fkey" FOREIGN KEY ("departement_id") REFERENCES "public"."departements"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_rayon_id_fkey" FOREIGN KEY ("rayon_id") REFERENCES "public"."rayons"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."rayons"
    ADD CONSTRAINT "rayons_departement_id_fkey" FOREIGN KEY ("departement_id") REFERENCES "public"."departements"("id") ON DELETE CASCADE;



CREATE POLICY "admin_all_plannings" ON "public"."plannings" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all_plannings_encadrement" ON "public"."plannings_encadrement" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all_plannings_permanence" ON "public"."plannings_permanence" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "admin_all_profiles" ON "public"."profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "chef_dept_insert_encadrement" ON "public"."plannings_encadrement" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("plannings_encadrement"."departement_id" = ANY ("p"."departement_ids"))))));



CREATE POLICY "chef_dept_select_encadrement" ON "public"."plannings_encadrement" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("plannings_encadrement"."departement_id" = ANY ("p"."departement_ids")))))));



CREATE POLICY "chef_dept_update_encadrement" ON "public"."plannings_encadrement" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("plannings_encadrement"."departement_id" = ANY ("p"."departement_ids"))))) AND ("statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text", 'soumis'::"text"])))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("plannings_encadrement"."departement_id" = ANY ("p"."departement_ids"))))) AND ("statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text", 'soumis'::"text"]))));



CREATE POLICY "chef_dept_update_soumis" ON "public"."plannings" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."rayons" "r" ON (("r"."id" = "plannings"."rayon_id")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("r"."departement_id" = ANY ("p"."departement_ids"))))) AND ("statut" = 'soumis_dept'::"text"))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."rayons" "r" ON (("r"."id" = "plannings"."rayon_id")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("r"."departement_id" = ANY ("p"."departement_ids"))))) AND ("statut" = ANY (ARRAY['brouillon'::"text", 'soumis_admin'::"text"]))));



CREATE POLICY "chef_rayon_insert_own" ON "public"."plannings" FOR INSERT TO "authenticated" WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("plannings"."rayon_id" = ANY ("p"."rayon_ids"))))));



CREATE POLICY "chef_rayon_update_own" ON "public"."plannings" FOR UPDATE TO "authenticated" USING (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("plannings"."rayon_id" = ANY ("p"."rayon_ids"))))) AND ("statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text"])))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("plannings"."rayon_id" = ANY ("p"."rayon_ids"))))) AND ("statut" = ANY (ARRAY['brouillon'::"text", 'soumis_dept'::"text"]))));



ALTER TABLE "public"."collaborateurs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "collaborateurs_write_admin" ON "public"."collaborateurs" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."departements" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "departements_select_all" ON "public"."departements" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "departements_write_admin" ON "public"."departements" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "lignes_enc_select" ON "public"."planning_encadrement_lignes" FOR SELECT TO "authenticated" USING (("planning_id" IN ( SELECT "plannings_encadrement"."id"
   FROM "public"."plannings_encadrement")));



CREATE POLICY "lignes_enc_write" ON "public"."planning_encadrement_lignes" TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."plannings_encadrement" "pe"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("pe"."id" = "planning_encadrement_lignes"."planning_id") AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("pe"."departement_id" = ANY ("p"."departement_ids")) AND ("pe"."statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text"]))))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."plannings_encadrement" "pe"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("pe"."id" = "planning_encadrement_lignes"."planning_id") AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("pe"."departement_id" = ANY ("p"."departement_ids")) AND ("pe"."statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text"])))))));



CREATE POLICY "lignes_select" ON "public"."planning_lignes" FOR SELECT TO "authenticated" USING (("planning_id" IN ( SELECT "plannings"."id"
   FROM "public"."plannings")));



CREATE POLICY "lignes_write" ON "public"."planning_lignes" TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."plannings" "pl"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("pl"."id" = "planning_lignes"."planning_id") AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("pl"."rayon_id" = ANY ("p"."rayon_ids")) AND ("pl"."statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text"]))))))) WITH CHECK (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM ("public"."plannings" "pl"
     JOIN "public"."profiles" "p" ON (("p"."id" = "auth"."uid"())))
  WHERE (("pl"."id" = "planning_lignes"."planning_id") AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("pl"."rayon_id" = ANY ("p"."rayon_ids")) AND ("pl"."statut" = ANY (ARRAY['brouillon'::"text", 'rejete'::"text"])))))));



CREATE POLICY "perm_lignes_select" ON "public"."permanence_lignes" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "perm_lignes_write" ON "public"."permanence_lignes" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "perm_membres_select" ON "public"."permanence_membres" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "perm_membres_write" ON "public"."permanence_membres" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "perm_select" ON "public"."plannings_permanence" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "perm_write" ON "public"."plannings_permanence" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."permanence_horaires" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "permanence_horaires_admin" ON "public"."permanence_horaires" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "permanence_horaires_select" ON "public"."permanence_horaires" FOR SELECT USING (("auth"."role"() = 'authenticated'::"text"));



ALTER TABLE "public"."permanence_lignes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."permanence_membres" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planning_encadrement_lignes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planning_lignes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plannings" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plannings_encadrement" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plannings_permanence" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "plannings_select" ON "public"."plannings" FOR SELECT TO "authenticated" USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("plannings"."rayon_id" = ANY ("p"."rayon_ids"))))) OR (EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     JOIN "public"."rayons" "r" ON (("r"."id" = "plannings"."rayon_id")))
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("r"."departement_id" = ANY ("p"."departement_ids")))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_self" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((("id" = "auth"."uid"()) OR "public"."is_admin"() OR ("departement_ids" && "public"."current_departement_ids"()) OR (EXISTS ( SELECT 1
   FROM "public"."rayons" "r"
  WHERE (("r"."id" = ANY ("profiles"."rayon_ids")) AND ("r"."departement_id" = ANY ("public"."current_departement_ids"())))))));



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "profiles_write_admin" ON "public"."profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."rayons" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rayons_select_all" ON "public"."rayons" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "rayons_write_admin" ON "public"."rayons" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "select_collaborateurs" ON "public"."collaborateurs" FOR SELECT USING (("public"."is_admin"() OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_departement'::"public"."user_role") AND ("collaborateurs"."departement_id" = ANY ("p"."departement_ids"))))) OR (EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'chef_rayon'::"public"."user_role") AND ("collaborateurs"."rayon_id" = ANY ("p"."rayon_ids")))))));



CREATE POLICY "select_own_profile" ON "public"."profiles" FOR SELECT USING ((("id" = "auth"."uid"()) OR "public"."is_admin"()));



CREATE POLICY "select_plannings" ON "public"."plannings" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."profiles" "p"
     LEFT JOIN "public"."rayons" "r" ON (("r"."id" = "plannings"."rayon_id")))
  WHERE (("p"."id" = "auth"."uid"()) AND (("p"."role" = 'administrateur'::"public"."user_role") OR (("p"."role" = 'chef_rayon'::"public"."user_role") AND ("plannings"."rayon_id" = ANY ("p"."rayon_ids"))) OR (("p"."role" = 'chef_departement'::"public"."user_role") AND ("r"."departement_id" = ANY ("p"."departement_ids"))))))));



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."current_departement_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_departement_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_departement_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_departement_ids"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_departement_ids"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_departement_ids"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_rayon_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_rayon_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_rayon_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "anon";
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."protect_profile_columns"() TO "service_role";



GRANT ALL ON TABLE "public"."collaborateurs" TO "anon";
GRANT ALL ON TABLE "public"."collaborateurs" TO "authenticated";
GRANT ALL ON TABLE "public"."collaborateurs" TO "service_role";



GRANT ALL ON TABLE "public"."departements" TO "anon";
GRANT ALL ON TABLE "public"."departements" TO "authenticated";
GRANT ALL ON TABLE "public"."departements" TO "service_role";



GRANT ALL ON TABLE "public"."permanence_horaires" TO "anon";
GRANT ALL ON TABLE "public"."permanence_horaires" TO "authenticated";
GRANT ALL ON TABLE "public"."permanence_horaires" TO "service_role";



GRANT ALL ON TABLE "public"."permanence_lignes" TO "anon";
GRANT ALL ON TABLE "public"."permanence_lignes" TO "authenticated";
GRANT ALL ON TABLE "public"."permanence_lignes" TO "service_role";



GRANT ALL ON TABLE "public"."permanence_membres" TO "anon";
GRANT ALL ON TABLE "public"."permanence_membres" TO "authenticated";
GRANT ALL ON TABLE "public"."permanence_membres" TO "service_role";



GRANT ALL ON TABLE "public"."planning_encadrement_lignes" TO "anon";
GRANT ALL ON TABLE "public"."planning_encadrement_lignes" TO "authenticated";
GRANT ALL ON TABLE "public"."planning_encadrement_lignes" TO "service_role";



GRANT ALL ON TABLE "public"."planning_lignes" TO "anon";
GRANT ALL ON TABLE "public"."planning_lignes" TO "authenticated";
GRANT ALL ON TABLE "public"."planning_lignes" TO "service_role";



GRANT ALL ON TABLE "public"."plannings" TO "anon";
GRANT ALL ON TABLE "public"."plannings" TO "authenticated";
GRANT ALL ON TABLE "public"."plannings" TO "service_role";



GRANT ALL ON TABLE "public"."plannings_encadrement" TO "anon";
GRANT ALL ON TABLE "public"."plannings_encadrement" TO "authenticated";
GRANT ALL ON TABLE "public"."plannings_encadrement" TO "service_role";



GRANT ALL ON TABLE "public"."plannings_permanence" TO "anon";
GRANT ALL ON TABLE "public"."plannings_permanence" TO "authenticated";
GRANT ALL ON TABLE "public"."plannings_permanence" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rayons" TO "anon";
GRANT ALL ON TABLE "public"."rayons" TO "authenticated";
GRANT ALL ON TABLE "public"."rayons" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







