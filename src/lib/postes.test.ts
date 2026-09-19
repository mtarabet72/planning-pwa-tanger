import { describe, it, expect } from 'vitest';
import {
  type Poste,
  POSTES_CYCLE,
  POSTES_SPECIAUX,
  POSTES_TOUS,
  POSTE_LABEL,
  POSTE_STYLE,
  POSTE_STYLE_FLAT,
  POSTE_FILL,
  POSTES_TRAVAIL,
  POSTES_REPOS,
  POSTES_ABSENCE,
  estTravail,
  estRepos,
  estAbsence,
} from './postes';

const TOUS_LES_POSTES: Poste[] = ['M', 'T', 'S', 'R', 'C', 'HN', 'MAL', 'AT', 'FOR'];

describe('POSTES_TOUS', () => {
  it('est l\'union exacte de POSTES_CYCLE et POSTES_SPECIAUX, sans doublon', () => {
    const union = [...new Set([...POSTES_CYCLE, ...POSTES_SPECIAUX])].sort();
    expect([...POSTES_TOUS].sort()).toEqual(union);
  });

  it('contient chaque code une seule fois', () => {
    expect(new Set(POSTES_TOUS).size).toBe(POSTES_TOUS.length);
  });
});

describe('POSTE_LABEL / POSTE_STYLE / POSTE_STYLE_FLAT / POSTE_FILL', () => {
  it('définissent une entrée pour chaque poste de POSTES_TOUS', () => {
    for (const p of TOUS_LES_POSTES) {
      expect(POSTE_LABEL[p], `POSTE_LABEL manque "${p}"`).toBeTruthy();
      expect(POSTE_STYLE[p], `POSTE_STYLE manque "${p}"`).toBeTruthy();
      expect(POSTE_STYLE_FLAT[p], `POSTE_STYLE_FLAT manque "${p}"`).toBeTruthy();
      expect(POSTE_FILL[p], `POSTE_FILL manque "${p}"`).toBeTruthy();
    }
  });

  it('POSTE_FILL fournit un triplet RGB valide (0-255) pour chaque poste', () => {
    for (const p of TOUS_LES_POSTES) {
      const [r, g, b] = POSTE_FILL[p];
      for (const channel of [r, g, b]) {
        expect(channel).toBeGreaterThanOrEqual(0);
        expect(channel).toBeLessThanOrEqual(255);
      }
    }
  });

  it('POSTE_STYLE (bordure) et POSTE_STYLE_FLAT partagent la même couleur de fond/texte', () => {
    for (const p of TOUS_LES_POSTES) {
      // POSTE_STYLE_FLAT doit être un préfixe de POSTE_STYLE (juste sans la classe border-*)
      expect(POSTE_STYLE[p].startsWith(POSTE_STYLE_FLAT[p])).toBe(true);
    }
  });
});

describe('POSTES_TRAVAIL / POSTES_REPOS / POSTES_ABSENCE', () => {
  it('partitionnent POSTES_TOUS sans chevauchement ni oubli', () => {
    const reunion = [...POSTES_TRAVAIL, ...POSTES_REPOS, ...POSTES_ABSENCE].sort();
    expect(reunion).toEqual([...TOUS_LES_POSTES].sort());
  });

  it('ne partagent aucun code entre les trois catégories', () => {
    const travail = new Set(POSTES_TRAVAIL);
    const repos = new Set(POSTES_REPOS);
    const absence = new Set(POSTES_ABSENCE);
    for (const p of travail) {
      expect(repos.has(p)).toBe(false);
      expect(absence.has(p)).toBe(false);
    }
    for (const p of repos) {
      expect(absence.has(p)).toBe(false);
    }
  });

  it('classe FOR (formation) comme absence, pas comme travail', () => {
    // Choix métier assumé pour les rapports/statistiques — voir le commentaire dans postes.ts.
    // Diffère intentionnellement de lib/anomalies.ts (FOR = travail effectif pour la détection).
    expect(estAbsence('FOR')).toBe(true);
    expect(estTravail('FOR')).toBe(false);
  });
});

describe('estTravail / estRepos / estAbsence', () => {
  it('estTravail reconnaît M, T, S, HN', () => {
    expect(estTravail('M')).toBe(true);
    expect(estTravail('T')).toBe(true);
    expect(estTravail('S')).toBe(true);
    expect(estTravail('HN')).toBe(true);
  });

  it('estRepos reconnaît R et C', () => {
    expect(estRepos('R')).toBe(true);
    expect(estRepos('C')).toBe(true);
  });

  it('estAbsence reconnaît MAL, AT, FOR', () => {
    expect(estAbsence('MAL')).toBe(true);
    expect(estAbsence('AT')).toBe(true);
    expect(estAbsence('FOR')).toBe(true);
  });

  it('un code de repos n\'est ni travail ni absence', () => {
    expect(estTravail('R')).toBe(false);
    expect(estAbsence('R')).toBe(false);
  });

  it('renvoie false pour une chaîne qui ne correspond à aucun poste connu', () => {
    expect(estTravail('XYZ')).toBe(false);
    expect(estRepos('XYZ')).toBe(false);
    expect(estAbsence('XYZ')).toBe(false);
  });
});