import type jsPDF from 'jspdf';
import { PERIODES, PERIODE_COULEUR, PERIODE_LABEL, periodeActive, type Periode, type StatsPeriodes } from './rapports';

/**
 * Graphiques statistiques dessinés directement dans un PDF jsPDF (vectoriel, net à l'impression) :
 * donut « total par période » + barres empilées par département. Mêmes données et mêmes couleurs
 * que les graphiques de l'écran (components/RapportGraphiques.tsx), donc déjà filtrés.
 */

export interface OptionsGraphiquesPDF {
  x: number;
  y: number;
  largeur: number;
  /** Hauteur de la page (mm) ; une nouvelle page est créée quand le bas est atteint. */
  pageH: number;
  unite: string;
  periodes: readonly Periode[];
  /** Ajoute une page et renvoie l'ordonnée de départ du contenu. */
  nouvellePage: () => number;
}

const MARGE_BAS = 18;
const HAUTEUR_DONUT = 46;
const HAUTEUR_LIGNE = 7;

const hexVersRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16),
];

function tronquer(doc: jsPDF, texte: string, maxW: number): string {
  if (doc.getTextWidth(texte) <= maxW) return texte;
  let t = texte;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
  return `${t}...`;
}

/** Secteur de donut : éventail de petits triangles (jsPDF n'a pas d'arc), trou central dessiné ensuite. */
function secteur(doc: jsPDF, cx: number, cy: number, r: number, a0: number, a1: number) {
  const pas = Math.max(1, Math.ceil(((a1 - a0) * 180) / Math.PI / 3));
  for (let i = 0; i < pas; i++) {
    const t0 = a0 + ((a1 - a0) * i) / pas;
    const t1 = a0 + ((a1 - a0) * (i + 1)) / pas;
    doc.triangle(cx, cy, cx + r * Math.cos(t0), cy + r * Math.sin(t0), cx + r * Math.cos(t1), cy + r * Math.sin(t1), 'FD');
  }
}

/** Dessine les graphiques à partir de (x, y) et renvoie l'ordonnée où poursuivre le contenu. */
export function dessinerGraphiquesPDF(doc: jsPDF, stats: StatsPeriodes, o: OptionsGraphiquesPDF): number {
  const { x, largeur, pageH, unite, periodes, nouvellePage } = o;
  let y = o.y;
  const limite = pageH - MARGE_BAS;
  const visibles = PERIODES.filter(p => periodeActive(periodes, p));

  if (y + 12 + HAUTEUR_DONUT > limite) y = nouvellePage();

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Statistiques par période', x, y + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(110, 110, 110);
  doc.text(`Unité : ${unite}`, x, y + 9);
  y += 12;

  // ── Donut : total par période ──
  const rayon = 20;
  const cx = x + rayon + 2;
  const cy = y + rayon + 2;
  doc.setLineWidth(0.1);
  let angle = -Math.PI / 2;
  for (const p of visibles) {
    const v = stats.global[p];
    if (v <= 0) continue;
    const fin = angle + (v / stats.total) * Math.PI * 2;
    const [r, g, b] = hexVersRgb(PERIODE_COULEUR[p]);
    doc.setFillColor(r, g, b);
    doc.setDrawColor(r, g, b);
    secteur(doc, cx, cy, rayon, angle, fin);
    angle = fin;
  }
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, rayon * 0.58, 'F');
  doc.setLineWidth(0.2);
  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(String(stats.total), cx, cy + 1.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(110, 110, 110);
  doc.text('au total', cx, cy + 5.5, { align: 'center' });

  // Légende à droite du donut
  let ly = cy - (visibles.length * 7) / 2 + 3;
  const lx = x + rayon * 2 + 12;
  for (const p of visibles) {
    const [r, g, b] = hexVersRgb(PERIODE_COULEUR[p]);
    doc.setFillColor(r, g, b);
    doc.rect(lx, ly - 2.6, 3.2, 3.2, 'F');
    doc.setFontSize(8);
    doc.setTextColor(30, 30, 30);
    const pct = stats.total ? Math.round((stats.global[p] / stats.total) * 100) : 0;
    doc.text(`${PERIODE_LABEL[p]} : ${stats.global[p]} (${pct} %)`, lx + 5.5, ly);
    ly += 7;
  }
  y += HAUTEUR_DONUT;

  // ── Barres empilées par département ──
  if (y + 10 + HAUTEUR_LIGNE > limite) y = nouvellePage();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text('Répartition par département', x, y + 3);
  y += 8;

  const largeurLabel = Math.min(48, largeur * 0.3);
  const largeurMax = largeur - largeurLabel - 14;
  const maxTotal = Math.max(1, ...stats.parDepartement.map(d => d.total));

  for (const dep of stats.parDepartement) {
    if (y + HAUTEUR_LIGNE > limite) y = nouvellePage();
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(50, 50, 50);
    doc.text(tronquer(doc, dep.departement, largeurLabel - 3), x, y + 4.4);

    let bx = x + largeurLabel;
    for (const p of visibles) {
      const w = (dep[p] / maxTotal) * largeurMax;
      if (w <= 0) continue;
      const [r, g, b] = hexVersRgb(PERIODE_COULEUR[p]);
      doc.setFillColor(r, g, b);
      doc.rect(bx, y + 0.8, w, 4.6, 'F');
      bx += w;
    }
    doc.setTextColor(80, 80, 80);
    doc.text(String(dep.total), bx + 1.8, y + 4.4);
    y += HAUTEUR_LIGNE;
  }

  doc.setTextColor(30, 30, 30);
  doc.setFont('helvetica', 'normal');
  return y + 3;
}
