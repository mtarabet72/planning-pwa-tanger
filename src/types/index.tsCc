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
  departement_id: string | null;
  rayon_id: string | null;
  actif: boolean;
}

export function canAccessAdmin(role: Role): boolean {
  return role === 'administrateur';
}

export function canConsolidateDepartement(role: Role): boolean {
  return role === 'administrateur' || role === 'chef_departement';
}
