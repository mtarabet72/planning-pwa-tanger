export function getLundi(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function formatDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatDisplay(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

export function formatDisplayLong(date: Date): string {
  return date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function getNumeroSemaine(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

/** Renvoie le lundi de la semaine au format ISO (yyyy-mm-dd), pratique pour les requêtes Supabase. */
export const getLundiIso = (date: Date) => formatDate(getLundi(date));

/** Parse un identifiant ISO (yyyy-mm-dd) en Date locale à minuit, sans décalage de fuseau horaire. */
export function parseDateIso(iso: string): Date {
  const [yyyy, mm, dd] = iso.split('-').map(Number);
  return new Date(yyyy, mm - 1, dd);
}

/** Format court jour/mois/année pour un identifiant ISO déjà connu (évite un aller-retour Date). */
export function formatSemaineCourte(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

export const JOURS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
export const JOURS_COURT = ['L', 'M', 'Me', 'J', 'V', 'S', 'D'];