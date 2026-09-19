import { describe, it, expect } from 'vitest';
import {
  getLundi,
  addDays,
  formatDate,
  formatDisplay,
  formatDisplayLong,
  getNumeroSemaine,
  getLundiIso,
  formatSemaineCourte,
  JOURS,
  JOURS_COURT,
} from './dates';

describe('getLundi', () => {
  it('renvoie la même date pour un lundi', () => {
    const lundi = new Date(2026, 8, 14); // lundi 14 septembre 2026
    expect(formatDate(getLundi(lundi))).toBe('2026-09-14');
  });

  it('recule un mardi au lundi précédent', () => {
    const mardi = new Date(2026, 8, 15);
    expect(formatDate(getLundi(mardi))).toBe('2026-09-14');
  });

  it('recule un dimanche au lundi de la même semaine (pas la suivante)', () => {
    const dimanche = new Date(2026, 8, 20);
    expect(formatDate(getLundi(dimanche))).toBe('2026-09-14');
  });

  it("franchit correctement un changement d'année", () => {
    // vendredi 1er janvier 2027 -> lundi de la semaine = 28 décembre 2026
    const vendredi = new Date(2027, 0, 1);
    expect(formatDate(getLundi(vendredi))).toBe('2026-12-28');
  });

  it('remet les heures/minutes/secondes à zéro', () => {
    const d = new Date(2026, 8, 16, 23, 59, 59);
    const lundi = getLundi(d);
    expect(lundi.getHours()).toBe(0);
    expect(lundi.getMinutes()).toBe(0);
    expect(lundi.getSeconds()).toBe(0);
  });

  it("ne modifie pas la date passée en argument", () => {
    const original = new Date(2026, 8, 16);
    const copie = new Date(original);
    getLundi(original);
    expect(original.getTime()).toBe(copie.getTime());
  });
});

describe('addDays', () => {
  it('avance de N jours', () => {
    const d = new Date(2026, 8, 14);
    expect(formatDate(addDays(d, 3))).toBe('2026-09-17');
  });

  it('recule avec un nombre négatif', () => {
    const d = new Date(2026, 8, 14);
    expect(formatDate(addDays(d, -7))).toBe('2026-09-07');
  });

  it('franchit un changement de mois', () => {
    const d = new Date(2026, 8, 29); // 29 septembre
    expect(formatDate(addDays(d, 3))).toBe('2026-10-02');
  });

  it('ne modifie pas la date passée en argument', () => {
    const original = new Date(2026, 8, 14);
    const copie = new Date(original);
    addDays(original, 5);
    expect(original.getTime()).toBe(copie.getTime());
  });
});

describe('formatDate', () => {
  it('formate au format ISO yyyy-mm-dd', () => {
    expect(formatDate(new Date(2026, 8, 7))).toBe('2026-09-07');
  });

  it('ajoute les zéros de remplissage (mois et jour < 10)', () => {
    expect(formatDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('formatDisplay', () => {
  it('affiche jour/mois sans année', () => {
    expect(formatDisplay(new Date(2026, 8, 7))).toBe('07/09');
  });
});

describe('formatDisplayLong', () => {
  it('affiche jour, mois en toutes lettres et année, sans nom de jour', () => {
    const result = formatDisplayLong(new Date(2026, 8, 7));
    expect(result).toContain('septembre');
    expect(result).toContain('2026');
    expect(result).toContain('07');
    // Ne doit pas inclure le nom du jour (variante longue réservée aux rapports quotidiens)
    expect(result.toLowerCase()).not.toContain('lundi');
  });
});

describe('getNumeroSemaine', () => {
  it('calcule le numéro ISO pour une date en milieu de semaine', () => {
    // Lundi 14 septembre 2026 = semaine 38 (vérifié via calendrier ISO 8601)
    expect(getNumeroSemaine(new Date(2026, 8, 14))).toBe(38);
  });

  it('gère le 1er janvier proche du changement de semaine ISO', () => {
    // Le 1er janvier 2026 est un jeudi -> semaine 1 selon la norme ISO 8601
    expect(getNumeroSemaine(new Date(2026, 0, 1))).toBe(1);
  });

  it('attribue le 31 décembre à la semaine 53 quand applicable', () => {
    // 31 décembre 2026 est un jeudi -> appartient à la semaine 53 de 2026 (ISO 8601)
    expect(getNumeroSemaine(new Date(2026, 11, 31))).toBe(53);
  });
});

describe('getLundiIso', () => {
  it('combine getLundi + formatDate en une seule chaîne ISO', () => {
    const mardi = new Date(2026, 8, 15);
    expect(getLundiIso(mardi)).toBe('2026-09-14');
  });
});

describe('formatSemaineCourte', () => {
  it('convertit un identifiant ISO en jj/mm/aaaa', () => {
    expect(formatSemaineCourte('2026-09-07')).toBe('07/09/2026');
  });
});

describe('JOURS / JOURS_COURT', () => {
  it('contiennent 7 entrées chacun, dans le même ordre (Lundi -> Dimanche)', () => {
    expect(JOURS).toHaveLength(7);
    expect(JOURS_COURT).toHaveLength(7);
  });

  it('commencent par Lundi et terminent par Dimanche', () => {
    expect(JOURS[0]).toBe('Lun');
    expect(JOURS[6]).toBe('Dim');
    expect(JOURS_COURT[0]).toBe('L');
    expect(JOURS_COURT[6]).toBe('D');
  });
});