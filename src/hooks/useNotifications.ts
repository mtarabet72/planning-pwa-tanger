export type Role = 'administrateur' | 'chef_departement' | 'chef_rayon';

export const ROLE_LABELS: Record<Role, string> = {
  administrateur: 'Administrateur',
  chef_departement: 'Chef de Département',
  chef_rayon: 'Chef de Rayon',
};

export interface Departement {
  id: string;
  code: string;
  nom: string;
}

export interface Rayon {
  id: string;
  numero: string | null;
  nom: string;
  departement_id: string;
  actif: boolean;
}

export interface Profile {
  id: string;
  nom: string;
  prenom: string;
  role: Role;
  departement_ids: string[];
  rayon_ids: string[];
  actif: boolean;
}

/** Helpers de compatibilité — un profil peut désormais gérer plusieurs rayons/départements. */
export function profileRayonIds(p: Pick<Profile, 'rayon_ids'> | null | undefined): string[] {
  return p?.rayon_ids ?? [];
}
export function profileDepartementIds(p: Pick<Profile, 'departement_ids'> | null | undefined): string[] {
  return p?.departement_ids ?? [];
}

export function canAccessAdmin(role: Role): boolean {
  return role === 'administrateur';
}

export function canConsolidateDepartement(role: Role): boolean {
  return role === 'administrateur' || role === 'chef_departement';
}
