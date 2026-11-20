import { describe, it, expect, vi } from 'vitest';
import { TAILLE_PAGE, decouper, lireParLots, lireToutesLesPages } from './pagination';

/** Fausse table de `n` lignes, servie par pages comme PostgREST (`range` inclusif). */
const table = (n: number) => {
  const lignes = Array.from({ length: n }, (_, i) => ({ id: i }));
  return vi.fn(async (debut: number, fin: number) => ({ data: lignes.slice(debut, fin + 1), error: null }));
};

describe('decouper', () => {
  it('découpe en lots de taille donnée', () => {
    expect(decouper([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(decouper([], 2)).toEqual([]);
  });
});

describe('lireToutesLesPages', () => {
  it('lit toutes les lignes au-delà de la limite de 1000', async () => {
    const q = table(2500);
    const res = await lireToutesLesPages(q);
    expect(res).toHaveLength(2500);
    expect(new Set(res.map(r => r.id)).size).toBe(2500);
    expect(q).toHaveBeenCalledTimes(3);
  });

  it('une seule requête quand le résultat tient dans une page', async () => {
    const q = table(10);
    expect(await lireToutesLesPages(q)).toHaveLength(10);
    expect(q).toHaveBeenCalledTimes(1);
  });

  it('gère le cas exact d\'une page pleine (une requête de plus, vide)', async () => {
    const q = table(TAILLE_PAGE);
    expect(await lireToutesLesPages(q)).toHaveLength(TAILLE_PAGE);
    expect(q).toHaveBeenCalledTimes(2);
  });

  it('table vide ou data null → tableau vide', async () => {
    expect(await lireToutesLesPages(async () => ({ data: null, error: null }))).toEqual([]);
  });

  it('propage l\'erreur au lieu de renvoyer un résultat partiel', async () => {
    await expect(lireToutesLesPages(async () => ({ data: null, error: { message: 'boom' } }))).rejects.toThrow('boom');
  });
});

describe('lireParLots', () => {
  it('interroge par lots de 100 identifiants et concatène les résultats', async () => {
    const ids = Array.from({ length: 250 }, (_, i) => `id${i}`);
    const requete = vi.fn(async (lot: string[], debut: number, fin: number) => ({
      data: lot.map(id => ({ id })).slice(debut, fin + 1),
      error: null,
    }));
    const res = await lireParLots(ids, requete);
    expect(res).toHaveLength(250);
    expect(requete).toHaveBeenCalledTimes(3);
    expect(requete.mock.calls.map(c => c[0].length)).toEqual([100, 100, 50]);
  });

  it('aucun identifiant → aucune requête', async () => {
    const requete = vi.fn();
    expect(await lireParLots([], requete)).toEqual([]);
    expect(requete).not.toHaveBeenCalled();
  });
});
