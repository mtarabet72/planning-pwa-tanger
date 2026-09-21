import { describe, it, expect } from 'vitest';
import { analyserAnomalies, type LigneBrute } from './anomalyRules';

// Semaine fixe de référence pour tous les tests (7 jours ISO consécutifs, lundi -> dimanche).
const JOURS = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20'];

function ligne(overrides: Partial<LigneBrute> & Pick<LigneBrute, 'collaborateur_id' | 'jour' | 'poste' | 'source'>): LigneBrute {
  return { rayon_id: 'r1', ...overrides };
}

/** Construit 7 lignes "Planning Rayon" pour un collaborateur, un poste par jour donné dans l'ordre de JOURS. */
function semaineComplete(collaborateurId: string, postes: string[], rayonId = 'r1'): LigneBrute[] {
  return JOURS.map((jour, i) => ligne({ collaborateur_id: collaborateurId, jour, poste: postes[i], source: 'Planning Rayon', rayon_id: rayonId }));
}

describe('analyserAnomalies — garde-fous généraux', () => {
  it('renvoie un tableau vide pour un jeu de lignes vide', () => {
    expect(analyserAnomalies([], JOURS)).toEqual([]);
  });

  it('utilise nomOf et nomRayon pour construire les messages', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'T', source: 'Encadrement', rayon_id: undefined }),
    ];
    const result = analyserAnomalies(lignes, JOURS, () => 'Amine Test', () => 'Épicerie');
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].message).toContain('Amine Test');
  });
});

describe('Règle 1 — double affectation', () => {
  it('détecte un collaborateur travaillant le même jour dans deux sources différentes', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'S', source: 'Encadrement', rayon_id: undefined }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    const anomalie = result.find(a => a.type === 'double_affectation');
    expect(anomalie).toBeDefined();
    expect(anomalie!.gravite).toBe('bloquante');
    expect(anomalie!.collaborateurId).toBe('c1');
  });

  it('ne se déclenche pas si les deux lignes sont dans la même source', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'double_affectation')).toBeUndefined();
  });

  it('ne se déclenche pas pour deux jours différents (une seule source par jour)', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c1', jour: JOURS[1], poste: 'S', source: 'Encadrement', rayon_id: undefined }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'double_affectation')).toBeUndefined();
  });

  it('ignore un repos (R) même présent dans deux sources le même jour', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'R', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'R', source: 'Encadrement', rayon_id: undefined }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'double_affectation')).toBeUndefined();
  });
});

describe('Règle 2 — repos hebdomadaire', () => {
  it("signale l'absence totale de repos sur une semaine complète", () => {
    const lignes = semaineComplete('c1', ['M', 'M', 'M', 'M', 'M', 'M', 'M']);
    const result = analyserAnomalies(lignes, JOURS);
    const anomalie = result.find(a => a.type === 'repos_hebdo');
    expect(anomalie).toBeDefined();
    expect(anomalie!.gravite).toBe('bloquante');
  });

  it("signale un excès de repos (plus d'un jour) sur une semaine complète", () => {
    const lignes = semaineComplete('c1', ['M', 'M', 'M', 'M', 'M', 'R', 'R']);
    const result = analyserAnomalies(lignes, JOURS);
    const anomalie = result.find(a => a.type === 'trop_repos');
    expect(anomalie).toBeDefined();
    expect(anomalie!.gravite).toBe('avertissement');
  });

  it('ne signale rien pour exactement un jour de repos', () => {
    const lignes = semaineComplete('c1', ['M', 'M', 'M', 'M', 'M', 'M', 'R']);
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'repos_hebdo' || a.type === 'trop_repos')).toBeUndefined();
  });

  it('ignore une semaine incomplète (moins de 7 jours renseignés), même sans aucun repos', () => {
    const lignes = JOURS.slice(0, 5).map(jour => ligne({ collaborateur_id: 'c1', jour, poste: 'M', source: 'Planning Rayon' }));
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'repos_hebdo')).toBeUndefined();
  });

  it("ne s'applique pas aux lignes hors 'Planning Rayon' (ex. Encadrement)", () => {
    const lignes = JOURS.map(jour => ligne({ collaborateur_id: 'c1', jour, poste: 'M', source: 'Encadrement', rayon_id: undefined }));
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'repos_hebdo')).toBeUndefined();
  });
});

describe('Règle 3 — effectif 1 (hors Matin)', () => {
  it('signale un jour travaillé hors Matin pour un rayon à un seul employé', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c1', jour: JOURS[1], poste: 'S', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    const anomalie = result.find(a => a.type === 'effectif1_hors_matin');
    expect(anomalie).toBeDefined();
    expect(anomalie!.gravite).toBe('avertissement');
  });

  it('ne signale rien si le seul employé est toujours en Matin ou en repos', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c1', jour: JOURS[1], poste: 'R', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'effectif1_hors_matin')).toBeUndefined();
  });
});

describe('Règle 3 — effectif 2 (couverture)', () => {
  it('accepte la combinaison Matin + Soir', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c2', jour: JOURS[0], poste: 'S', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'effectif2_couverture')).toBeUndefined();
  });

  it('accepte la combinaison Matin + Tranche', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c2', jour: JOURS[0], poste: 'T', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'effectif2_couverture')).toBeUndefined();
  });

  it('signale deux employés sur le même poste le même jour', () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c2', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    const anomalie = result.find(a => a.type === 'effectif2_couverture');
    expect(anomalie).toBeDefined();
    expect(anomalie!.gravite).toBe('avertissement');
  });

  it("ne signale rien si un seul des deux travaille ce jour-là (l'autre en repos)", () => {
    const lignes = [
      ligne({ collaborateur_id: 'c1', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c2', jour: JOURS[0], poste: 'R', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'effectif2_couverture')).toBeUndefined();
  });
});

describe('Règle 3 — effectif 3+ (répartition)', () => {
  it('ne signale rien pour une répartition équilibrée (écart <= 1)', () => {
    const lignes = [
      ...semaineComplete('c1', ['M', 'M', 'M', 'M', 'S', 'R', 'R']),
      ...semaineComplete('c2', ['M', 'M', 'S', 'S', 'M', 'R', 'R']),
      ...semaineComplete('c3', ['S', 'S', 'M', 'M', 'M', 'R', 'R']),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'effectif3_repartition')).toBeUndefined();
  });

  it('signale une répartition déséquilibrée (écart > 1) sur les postes Soir/Tranche', () => {
    const lignes = [
      ...semaineComplete('c1', ['S', 'S', 'S', 'S', 'M', 'R', 'R']), // 4 S/T
      ...semaineComplete('c2', ['M', 'M', 'M', 'M', 'M', 'R', 'R']), // 0 S/T
      ...semaineComplete('c3', ['M', 'M', 'M', 'M', 'S', 'R', 'R']), // 1 S/T
    ];
    const result = analyserAnomalies(lignes, JOURS);
    const anomalie = result.find(a => a.type === 'effectif3_repartition');
    expect(anomalie).toBeDefined();
    expect(anomalie!.gravite).toBe('avertissement');
    expect(anomalie!.detail).toBeTruthy();
  });

  it("est ignorée si la semaine n'est pas complète pour tous les employés du rayon", () => {
    const lignes = [
      ...semaineComplete('c1', ['S', 'S', 'S', 'S', 'M', 'R', 'R']),
      ...semaineComplete('c2', ['M', 'M', 'M', 'M', 'M', 'R', 'R']),
      // c3 : seulement 3 jours sur 7 -> semaine incomplète pour le rayon entier
      ligne({ collaborateur_id: 'c3', jour: JOURS[0], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c3', jour: JOURS[1], poste: 'M', source: 'Planning Rayon' }),
      ligne({ collaborateur_id: 'c3', jour: JOURS[2], poste: 'M', source: 'Planning Rayon' }),
    ];
    const result = analyserAnomalies(lignes, JOURS);
    expect(result.find(a => a.type === 'effectif3_repartition')).toBeUndefined();
  });
});