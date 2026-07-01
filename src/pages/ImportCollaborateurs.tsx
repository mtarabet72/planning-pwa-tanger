import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, Loader2, X, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

interface CollaborateurRow {
  matricule: string;
  nom: string;
  prenom: string;
  departement: string;
  rayon: string;
  statut?: 'ok' | 'erreur' | 'doublon';
  message?: string;
}

export default function ImportCollaborateurs({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<CollaborateurRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [stats, setStats] = useState({ ok: 0, erreur: 0, doublon: 0 });
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const data = new Uint8Array(e.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }) as string[][];

      const parsed: CollaborateurRow[] = [];
      for (let i = 1; i < raw.length; i++) {
        const row = raw[i];
        if (!row || !row[0]) continue;
        parsed.push({
          matricule: String(row[0] ?? '').trim(),
          nom: String(row[1] ?? '').trim(),
          prenom: String(row[2] ?? '').trim(),
          departement: String(row[3] ?? '').trim(),
          rayon: String(row[4] ?? '').trim(),
        });
      }
      setRows(parsed);
      setDone(false);
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleImport() {
    setImporting(true);
    const updated: CollaborateurRow[] = [];
    let ok = 0, erreur = 0, doublon = 0;

    for (const row of rows) {
      if (!row.matricule || !row.nom) {
        updated.push({ ...row, statut: 'erreur', message: 'Matricule ou nom manquant' });
        erreur++;
        continue;
      }

      // Résoudre departement_id
      const { data: dep } = await supabase
        .from('departements')
        .select('id')
        .ilike('nom', row.departement)
        .single();

      // Résoudre rayon_id
      const { data: rayon } = await supabase
        .from('rayons')
        .select('id')
        .ilike('nom', row.rayon)
        .single();

      // Upsert sur matricule
      const { error } = await supabase.from('collaborateurs').upsert(
        {
          matricule: row.matricule,
          nom: row.nom,
          prenom: row.prenom,
          departement_id: dep?.id ?? null,
          rayon_id: rayon?.id ?? null,
          actif: true,
        },
        { onConflict: 'matricule' }
      );

      if (error) {
        updated.push({ ...row, statut: 'erreur', message: error.message });
        erreur++;
      } else if (dep === null || rayon === null) {
        updated.push({ ...row, statut: 'doublon', message: 'Importé mais département/rayon non trouvé' });
        doublon++;
      } else {
        updated.push({ ...row, statut: 'ok' });
        ok++;
      }
    }

    setRows(updated);
    setStats({ ok, erreur, doublon });
    setImporting(false);
    setDone(true);
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl my-8">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <FileSpreadsheet className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold">Import Collaborateurs</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Zone de dépôt */}
          {!rows.length && (
            <div
              onClick={() => inputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-2xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition"
            >
              <Upload className="w-10 h-10 text-gray-400 mx-auto mb-3" />
              <p className="font-medium text-gray-700">Glisse ton fichier Excel ici</p>
              <p className="text-sm text-gray-400 mt-1">ou appuie pour choisir un fichier</p>
              <p className="text-xs text-gray-400 mt-3">
                Colonnes attendues : A=Matricule · B=Nom · C=Prénom · D=Département · E=Rayon
              </p>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          )}

          {/* Aperçu */}
          {rows.length > 0 && (
            <>
              {done && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                    <div className="text-2xl font-bold text-emerald-600">{stats.ok}</div>
                    <div className="text-xs text-emerald-700 mt-1">Importés</div>
                  </div>
                  <div className="bg-amber-50 rounded-2xl p-4 text-center">
                    <div className="text-2xl font-bold text-amber-600">{stats.doublon}</div>
                    <div className="text-xs text-amber-700 mt-1">Avertissements</div>
                  </div>
                  <div className="bg-red-50 rounded-2xl p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{stats.erreur}</div>
                    <div className="text-xs text-red-700 mt-1">Erreurs</div>
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-500 font-medium">
                {rows.length} ligne(s) détectée(s)
              </div>

              <div className="overflow-x-auto rounded-2xl border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Matricule</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Nom</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Prénom</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Département</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-500">Rayon</th>
                      {done && <th className="text-left px-3 py-2 font-medium text-gray-500">Statut</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map((r, i) => (
                      <tr key={i} className={
                        r.statut === 'ok' ? 'bg-emerald-50/40' :
                        r.statut === 'erreur' ? 'bg-red-50/40' :
                        r.statut === 'doublon' ? 'bg-amber-50/40' : ''
                      }>
                        <td className="px-3 py-2 font-mono">{r.matricule}</td>
                        <td className="px-3 py-2">{r.nom}</td>
                        <td className="px-3 py-2">{r.prenom}</td>
                        <td className="px-3 py-2">{r.departement}</td>
                        <td className="px-3 py-2">{r.rayon}</td>
                        {done && (
                          <td className="px-3 py-2">
                            {r.statut === 'ok' && <CheckCircle className="w-4 h-4 text-emerald-500" />}
                            {r.statut === 'erreur' && (
                              <span className="flex items-center gap-1 text-red-500">
                                <AlertCircle className="w-4 h-4" />
                                <span>{r.message}</span>
                              </span>
                            )}
                            {r.statut === 'doublon' && (
                              <span className="text-amber-500">{r.message}</span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => { setRows([]); setDone(false); }}
                  className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium"
                >
                  Changer de fichier
                </button>
                {!done && (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex-1 py-3 rounded-2xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {importing && <Loader2 className="w-4 h-4 animate-spin" />}
                    {importing ? 'Import en cours...' : `Importer ${rows.length} collaborateurs`}
                  </button>
                )}
                {done && (
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
                  >
                    Terminer
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
