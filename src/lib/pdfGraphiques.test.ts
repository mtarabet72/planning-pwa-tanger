import { describe, it, expect } from 'vitest';
import { jsPDF } from 'jspdf';
import { dessinerGraphiquesPDF } from './pdfGraphiques';
import { naturesVides, periodesVides, statsNatures, type StatsPeriodes } from './rapports';

const stats = (nbDeps: number): StatsPeriodes => {
  const parDepartement = Array.from({ length: nbDeps }, (_, i) => ({
    departement: `Département ${i + 1} au nom volontairement très long pour tester la troncature`,
    ...periodesVides(), M: 3, T: 1, S: 2, total: 6,
  }));
  return { parDepartement, global: { M: 3 * nbDeps, T: nbDeps, S: 2 * nbDeps, HN: 0 }, total: 6 * nbDeps };
};

const dessiner = (s: StatsPeriodes, periodes: ('M' | 'T' | 'S' | 'HN')[] = []) => {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const fin = dessinerGraphiquesPDF(doc, s, {
    x: 14, y: 28, largeur: 182, pageH: 297, unite: 'collaborateurs', periodes,
    nouvellePage: () => { doc.addPage(); return 20; },
  });
  return { doc, fin };
};

describe('dessinerGraphiquesPDF', () => {
  it('ajoute la répartition par nature (repos, congé, maladie…) quand elle est fournie', () => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const natures = statsNatures([{ natures: { ...naturesVides(), M: 5, R: 10, C: 3, MAL: 2, FE: 1 } }]);
    const sans = dessinerGraphiquesPDF(new jsPDF({ unit: 'mm', format: 'a4' }), stats(2), {
      x: 14, y: 28, largeur: 182, pageH: 297, unite: 'collaborateurs', periodes: [], nouvellePage: () => 20,
    });
    const avec = dessinerGraphiquesPDF(doc, stats(2), {
      x: 14, y: 28, largeur: 182, pageH: 297, unite: 'collaborateurs', periodes: [], natures,
      nouvellePage: () => { doc.addPage(); return 20; },
    });
    expect(avec).toBeGreaterThan(sans + 5 * 7 - 1);
  });

  it('dessine donut + barres et renvoie une ordonnée de reprise sous le point de départ', () => {
    const { doc, fin } = dessiner(stats(3));
    expect(fin).toBeGreaterThan(28 + 46);
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it('crée de nouvelles pages quand il y a beaucoup de départements', () => {
    const { doc } = dessiner(stats(60));
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  });

  it('fonctionne avec un filtre de période actif', () => {
    const s = stats(2);
    s.global = { M: 6, T: 0, S: 0, HN: 0 };
    s.total = 6;
    const { fin } = dessiner(s, ['M']);
    expect(fin).toBeGreaterThan(28);
  });
});
