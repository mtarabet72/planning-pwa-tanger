import { describe, it, expect } from 'vitest';
import { POSTES_TRAVAIL } from './postes';
import {
  PERIODES,
  basculerPeriode,
  filtrerHebdo,
  filtrerJournalier,
  filtrerMensuel,
  libellePeriodes,
  mentionsFiltres,
  periodesVides,
  statsHebdo,
  statsJournalier,
  statsMensuel,
  type MoisLigne,
  type RayonLigne,
  type SemaineLigne,
} from './rapports';

const journalier: RayonLigne[] = [
  {
    rayonNom: 'Fruits', depNom: 'Frais',
    collaborateurs: [
      { nom: 'A', prenom: 'a', poste: 'M' },
      { nom: 'B', prenom: 'b', poste: 'S' },
      { nom: 'C', prenom: 'c', poste: 'M' },
    ],
  },
  {
    rayonNom: 'Jouets', depNom: 'Bazar',
    collaborateurs: [{ nom: 'D', prenom: 'd', poste: 'T' }],
  },
];

const hebdo: SemaineLigne[] = [
  {
    rayonNom: 'Fruits', depNom: 'Frais',
    collaborateurs: [
      { nom: 'A', prenom: 'a', postes: ['M', 'M', 'S', 'R', 'R', 'C', 'R'] },
      { nom: 'B', prenom: 'b', postes: ['R', 'R', 'R', 'R', 'R', 'R', 'R'] },
    ],
  },
];

const mensuel: MoisLigne[] = [
  { nom: 'A', prenom: 'a', rayonNom: 'Fruits', depNom: 'Frais', travail: 20, repos: 8, conge: 2, absences: 0, total: 30,
    parPeriode: { M: 10, T: 2, S: 8, HN: 0 } },
  { nom: 'B', prenom: 'b', rayonNom: 'Jouets', depNom: '', travail: 5, repos: 25, conge: 0, absences: 0, total: 30,
    parPeriode: { M: 0, T: 5, S: 0, HN: 0 } },
];

describe('PERIODES', () => {
  it('reste synchronisée avec POSTES_TRAVAIL', () => {
    expect([...PERIODES].sort()).toEqual([...POSTES_TRAVAIL].sort());
  });
});

describe('basculerPeriode', () => {
  it('ajoute puis retire une période', () => {
    expect(basculerPeriode([], 'S')).toEqual(['S']);
    expect(basculerPeriode(['S'], 'M')).toEqual(['M', 'S']); // ordre canonique
    expect(basculerPeriode(['M', 'S'], 'M')).toEqual(['S']);
    expect(basculerPeriode(['S'], 'S')).toEqual([]);
  });

  it('revient à « Toutes » (tableau vide) quand les 4 périodes sont cochées', () => {
    expect(basculerPeriode(['M', 'T', 'S'], 'HN')).toEqual([]);
  });
});

describe('libellés', () => {
  it('libellePeriodes', () => {
    expect(libellePeriodes([])).toBe('Toutes les périodes');
    expect(libellePeriodes(['M', 'S'])).toBe('Matin, Soir');
  });

  it('mentionsFiltres : uniquement les filtres actifs', () => {
    expect(mentionsFiltres([], null)).toEqual([]);
    expect(mentionsFiltres(['M'], null)).toEqual(['Période : Matin']);
    expect(mentionsFiltres([], 'RH')).toEqual(['Département : RH']);
    expect(mentionsFiltres(['S'], 'RH')).toEqual(['Période : Soir', 'Département : RH']);
  });
});

describe('filtrerJournalier', () => {
  it('sans filtre, renvoie les données telles quelles', () => {
    expect(filtrerJournalier(journalier, [])).toBe(journalier);
  });

  it('ne garde que les collaborateurs de la période et retire les rayons vides', () => {
    const r = filtrerJournalier(journalier, ['M']);
    expect(r).toHaveLength(1);
    expect(r[0].collaborateurs.map(c => c.nom)).toEqual(['A', 'C']);
  });

  it('combine plusieurs périodes', () => {
    const r = filtrerJournalier(journalier, ['S', 'T']);
    expect(r.map(x => x.rayonNom)).toEqual(['Fruits', 'Jouets']);
    expect(r[0].collaborateurs.map(c => c.nom)).toEqual(['B']);
  });

  it('renvoie une liste vide si aucune donnée ne correspond', () => {
    expect(filtrerJournalier(journalier, ['HN'])).toEqual([]);
  });
});

describe('filtrerHebdo', () => {
  it('masque les cases hors période et retire les collaborateurs sans jour concerné', () => {
    const r = filtrerHebdo(hebdo, ['M']);
    expect(r).toHaveLength(1);
    expect(r[0].collaborateurs).toHaveLength(1);
    expect(r[0].collaborateurs[0].postes).toEqual(['M', 'M', null, null, null, null, null]);
  });

  it('retire le rayon si plus personne ne correspond', () => {
    expect(filtrerHebdo(hebdo, ['T'])).toEqual([]);
  });
});

describe('filtrerMensuel', () => {
  it('recalcule « travail » sur les périodes choisies et remet les autres à zéro', () => {
    const r = filtrerMensuel(mensuel, ['M', 'S']);
    expect(r).toHaveLength(1);
    expect(r[0].travail).toBe(18);
    expect(r[0].parPeriode).toEqual({ M: 10, T: 0, S: 8, HN: 0 });
  });

  it('ne mute pas les données d\'origine', () => {
    filtrerMensuel(mensuel, ['M']);
    expect(mensuel[0].travail).toBe(20);
    expect(mensuel[0].parPeriode.T).toBe(2);
  });
});

describe('statistiques', () => {
  it('statsJournalier : par département et global', () => {
    const s = statsJournalier(journalier);
    expect(s.total).toBe(4);
    expect(s.global).toEqual({ M: 2, T: 1, S: 1, HN: 0 });
    expect(s.parDepartement.map(d => d.departement)).toEqual(['Bazar', 'Frais']);
    expect(s.parDepartement[1]).toMatchObject({ departement: 'Frais', M: 2, S: 1, total: 3 });
  });

  it('suit le filtre (statistiques calculées sur les données filtrées)', () => {
    const s = statsJournalier(filtrerJournalier(journalier, ['M']));
    expect(s.global).toEqual({ M: 2, T: 0, S: 0, HN: 0 });
    expect(s.parDepartement).toHaveLength(1);
  });

  it('statsHebdo compte les jours-collaborateur et ignore les cases masquées / non travaillées', () => {
    const s = statsHebdo(hebdo);
    expect(s.global).toEqual({ M: 2, T: 0, S: 1, HN: 0 });
    expect(s.total).toBe(3);
  });

  it('statsMensuel regroupe les départements vides sous « Sans département »', () => {
    const s = statsMensuel(mensuel);
    expect(s.total).toBe(25);
    expect(s.parDepartement.map(d => d.departement)).toEqual(['Frais', 'Sans département']);
  });

  it('cas limite : aucune donnée', () => {
    const s = statsJournalier([]);
    expect(s).toEqual({ parDepartement: [], global: periodesVides(), total: 0 });
  });
});
