import { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { Users, Calendar, BarChart3, FileText, Settings, LogOut, Loader2, X, UserCog, LayoutGrid, Building2, User, Bell, ClipboardCheck, History, MoreHorizontal, Users2, Crown, Trash2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import ImportCollaborateurs from './pages/ImportCollaborateurs';
import Collaborateurs from './pages/Collaborateurs';
import Utilisateurs from './pages/Utilisateurs';
import Planning from './pages/Planning';
import Dashboard from './pages/Dashboard';
import Consolidation from './pages/Consolidation';
import Rayons from './pages/Rayons';
import Rapports from './pages/Rapports';
import Departements from './pages/Departements';
import Profil from './pages/Profil';
import Validation from './pages/Validation';
import Historique from './pages/Historique';
import PlanningEncadrement from './pages/PlanningEncadrement';
import PlanningDirection from './pages/PlanningDirection';
import Reinitialisation from './pages/Reinitialisation';
import NouveauMotDePasse from './pages/NouveauMotDePasse';
import Sidebar from './components/Sidebar';
import { canAccessAdmin, isAccueil, type Tab } from './types';
import { useNotifications } from './hooks/useNotifications';
import { AssistantProvider } from './context/AssistantContext';
import AssistantWidget from './components/AssistantWidget';

function formatSemaineCourte(iso: string): string {
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}/${mm}/${yyyy}`;
}

function FullScreenMessage({ title, body, onSignOut }: { title: string; body: string; onSignOut: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{body}</p>
        <button onClick={onSignOut} className="text-sm font-medium text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl transition">
          Déconnexion
        </button>
      </div>
    </div>
  );
}

type AdminSection = 'menu' | 'collaborateurs' | 'utilisateurs' | 'rayons' | 'departements' | 'reinitialisation';

/** Déduit l'onglet actif à partir du chemin d'URL (ex. "/admin/rayons" -> "admin"). */
function tabFromPath(pathname: string): Tab {
  const segment = pathname.replace(/^\/+/, '').split('/')[0];
  const tabs: Tab[] = ['dashboard', 'planning', 'encadrement', 'direction', 'validation', 'historique', 'consolidation', 'admin', 'reports', 'profil'];
  return (tabs as string[]).includes(segment) ? (segment as Tab) : 'dashboard';
}

/** Déduit la sous-section Administration active à partir du chemin d'URL (ex. "/admin/rayons" -> "rayons"). */
function adminSectionFromPath(pathname: string): AdminSection {
  const parts = pathname.replace(/^\/+/, '').split('/');
  const sections: AdminSection[] = ['collaborateurs', 'utilisateurs', 'rayons', 'departements', 'reinitialisation'];
  const sub = parts[1];
  return (sections as string[]).includes(sub) ? (sub as AdminSection) : 'menu';
}

function AppShell() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const activeTab = tabFromPath(location.pathname);
  const adminSection = adminSectionFromPath(location.pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const { rayonsSansPlanning, planningsAttenteDept, planningsAttenteAdmin, planningsRejetes, planningsValides, marquerValidesVus, count: notifCount } = useNotifications(profile);
  const nbRejetesRayon = planningsRejetes.filter(p => p.type === 'rayon').length;
  const nbRejetesEnc = planningsRejetes.filter(p => p.type === 'encadrement').length;
  const nbSansPlanning = rayonsSansPlanning.length;
  const nbPlanningBadge = nbSansPlanning + nbRejetesRayon;
  const nbAValider = planningsAttenteDept.length + planningsAttenteAdmin.length;

  if (!profile) return null;

  const isAdmin = canAccessAdmin(profile.role);
  const isChefDep = profile.role === 'chef_departement';
  const estAccueil = isAccueil(profile.role);
  const fullName = `${profile.prenom} ${profile.nom}`.trim();


  const bottomNav = estAccueil
    ? ([
        { id: 'consolidation', label: 'Consolidation', icon: LayoutGrid },
        { id: 'profil', label: 'Profil', icon: User },
      ] as const)
    : ([
        { id: 'dashboard', label: 'Accueil', icon: BarChart3 },
        { id: 'planning', label: 'Planning', icon: Calendar },
        { id: 'validation', label: 'Validation', icon: ClipboardCheck },
        { id: 'historique', label: 'Historique', icon: History },
      ] as const);

  function ouvrirNotifications() {
    setShowNotifications(v => {
      if (!v) marquerValidesVus();
      return !v;
    });
  }

  function handleNav(id: Tab) {
    navigate('/' + id);
    setSidebarOpen(false);
    setShowNotifications(false);
    setShowMore(false);
  }

  const adminTitle: Record<typeof adminSection, string> = {
    menu: 'Administration',
    collaborateurs: 'Collaborateurs',
    utilisateurs: 'Utilisateurs',
    rayons: 'Rayons',
    departements: 'Départements',
    reinitialisation: 'Réinitialisation',
  };

  const pageTitle: Record<typeof activeTab, string> = {
    dashboard: 'Tableau de Bord',
    planning: 'Planning',
    encadrement: 'Planning Encadrement',
    direction: 'Permanence & Direction',
    validation: 'Validation',
    historique: 'Historique',
    consolidation: 'Consolidation',
    admin: adminTitle[adminSection],
    reports: 'Rapports',
    profil: 'Mon Profil',
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {showImport && <ImportCollaborateurs onClose={() => setShowImport(false)} />}

      {showNotifications && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowNotifications(false)} />
          <div className="absolute right-4 top-16 lg:top-20 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-600" />
                <span className="font-semibold text-sm">Notifications</span>
              </div>
              <button onClick={() => setShowNotifications(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>

            {notifCount === 0 && planningsValides.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-2xl mb-2">✅</div>
                <p className="text-sm text-gray-500">Rien à signaler pour le moment.</p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                {planningsRejetes.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-red-500 uppercase tracking-wide">Rejetés — à corriger</p>
                    <div className="divide-y divide-gray-50">
                      {planningsRejetes.map(p => (
                        <button key={p.id} onClick={() => handleNav(p.type === 'rayon' ? 'planning' : 'encadrement')}
                          className="w-full text-left px-4 py-3 hover:bg-red-50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 truncate">{p.type === 'rayon' ? p.rayonNom : `Encadrement — ${p.depNom}`}</p>
                              <p className="text-xs text-gray-400">Semaine du {formatSemaineCourte(p.semaineDebut)}</p>
                              <p className="text-xs text-red-600 mt-1">Motif : {p.commentaire}</p>
                            </div>
                            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium shrink-0">Rejeté</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {rayonsSansPlanning.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">Rayons sans planning</p>
                    <div className="divide-y divide-gray-50">
                      {rayonsSansPlanning.map(r => (
                        <div key={r.id} className="px-4 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-gray-900">{r.nom}</p>
                              <p className="text-xs text-gray-400">{r.depNom} · {r.nb_collaborateurs} collab.</p>
                            </div>
                            <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-medium">En retard</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {planningsAttenteDept.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">En attente de votre validation</p>
                    <div className="divide-y divide-gray-50">
                      {planningsAttenteDept.map(p => (
                        <div key={p.id} className="px-4 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-gray-900">{p.rayonNom}</p>
                              <p className="text-xs text-gray-400">{p.depNom} · Semaine du {formatSemaineCourte(p.semaineDebut)}</p>
                            </div>
                            <span className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full font-medium">À valider</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {planningsValides.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-emerald-600 uppercase tracking-wide">Validés récemment</p>
                    <div className="divide-y divide-gray-50">
                      {planningsValides.map(p => (
                        <div key={p.id} className="px-4 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-gray-900 truncate">{p.type === 'rayon' ? p.rayonNom : `Encadrement — ${p.depNom}`}</p>
                              <p className="text-xs text-gray-400">Semaine du {formatSemaineCourte(p.semaineDebut)} · validé le {new Date(p.valideAt).toLocaleDateString('fr-FR')}</p>
                            </div>
                            <span className="text-xs bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full font-medium shrink-0">Validé ✓</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {planningsAttenteAdmin.length > 0 && (
                  <div>
                    <p className="px-4 pt-3 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">En attente de validation admin</p>
                    <div className="divide-y divide-gray-50">
                      {planningsAttenteAdmin.map(p => (
                        <div key={p.id} className="px-4 py-3 hover:bg-gray-50">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium text-sm text-gray-900">{p.type === 'rayon' ? p.rayonNom : `Encadrement — ${p.depNom}`}</p>
                              <p className="text-xs text-gray-400">
                                {p.type === 'rayon' ? `${p.depNom} · ` : ''}Semaine du {formatSemaineCourte(p.semaineDebut)}
                              </p>
                            </div>
                            <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">À valider</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {notifCount > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => handleNav(rayonsSansPlanning.length > 0 && planningsAttenteDept.length === 0 && planningsAttenteAdmin.length === 0 ? 'planning' : 'validation')}
                  className="w-full text-sm text-blue-600 font-medium text-center hover:text-blue-700">
                  {planningsAttenteDept.length > 0 || planningsAttenteAdmin.length > 0 ? 'Aller à Validation →' : 'Aller au Planning →'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showMore && (
        <div className="fixed inset-0 z-50 lg:hidden flex items-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowMore(false)} />
          <div className="relative w-full bg-white rounded-t-3xl shadow-2xl p-6 z-50">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-gray-900">Plus</span>
              <button onClick={() => setShowMore(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {(isAdmin || isChefDep) && (
                <button onClick={() => handleNav('encadrement')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'encadrement' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <Users2 className="w-6 h-6 text-purple-600" />
                  <span className="text-xs font-medium text-gray-700">Encadrement</span>
                </button>
              )}
              {isAdmin && (
                <button onClick={() => handleNav('direction')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'direction' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <Crown className="w-6 h-6 text-red-600" />
                  <span className="text-xs font-medium text-gray-700">Permanence</span>
                </button>
              )}
              {(isAdmin || isChefDep || estAccueil) && (
                <button onClick={() => handleNav('consolidation')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'consolidation' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <LayoutGrid className="w-6 h-6 text-blue-600" />
                  <span className="text-xs font-medium text-gray-700">Consolidation</span>
                </button>
              )}
              {isAdmin && (
                <button onClick={() => handleNav('admin')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'admin' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <Users className="w-6 h-6 text-purple-600" />
                  <span className="text-xs font-medium text-gray-700">Admin</span>
                </button>
              )}
              {!estAccueil && (
                <button onClick={() => handleNav('reports')}
                  className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'reports' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                  <FileText className="w-6 h-6 text-emerald-600" />
                  <span className="text-xs font-medium text-gray-700">Rapports</span>
                </button>
              )}
              <button onClick={() => handleNav('profil')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'profil' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                <User className="w-6 h-6 text-gray-600" />
                <span className="text-xs font-medium text-gray-700">Profil</span>
              </button>
              <button onClick={() => { setShowMore(false); void signOut(); }}
                className="flex flex-col items-center gap-2 p-4 rounded-2xl border border-gray-100 hover:bg-red-50 transition">
                <LogOut className="w-6 h-6 text-red-500" />
                <span className="text-xs font-medium text-red-500">Déconnexion</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:flex lg:flex-col bg-white border-r border-gray-200 shadow-xl z-40">
        <Sidebar activeTab={activeTab} onNav={handleNav} onSignOut={() => void signOut()} isAdmin={isAdmin} isChefDep={isChefDep} isAccueil={estAccueil} fullName={fullName} role={profile.role} planningBadge={nbPlanningBadge} validationBadge={nbAValider} encadrementBadge={nbRejetesEnc} />
      </div>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
            <Sidebar activeTab={activeTab} onNav={handleNav} onSignOut={() => void signOut()} isAdmin={isAdmin} isChefDep={isChefDep} isAccueil={estAccueil} fullName={fullName} role={profile.role} planningBadge={nbPlanningBadge} validationBadge={nbAValider} encadrementBadge={nbRejetesEnc} />
          </div>
        </div>
      )}

      <div className="lg:ml-72 pb-20 lg:pb-0">

        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
            <span className="font-semibold text-gray-900 text-sm">{pageTitle[activeTab]}</span>
          </div>
          <button onClick={ouvrirNotifications} className="relative p-2 rounded-xl hover:bg-gray-100">
            <Bell className="w-5 h-5 text-gray-600" />
            {notifCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
        </div>

        <div className="p-4 lg:p-8">

          <header className="hidden lg:flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              {activeTab === 'admin' && adminSection !== 'menu' && (
                <button onClick={() => navigate('/admin')} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 text-lg">←</button>
              )}
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{pageTitle[activeTab]}</h2>
                <p className="text-gray-500 mt-1 text-sm">Bienvenue, {fullName}</p>
              </div>
            </div>
            <button onClick={ouvrirNotifications} className="relative p-3 rounded-xl hover:bg-gray-100 transition">
              <Bell className="w-5 h-5 text-gray-600" />
              {notifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
          </header>

          {nbSansPlanning > 0 && (activeTab === 'dashboard' || activeTab === 'planning') && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-600">⚠️</span>
                <span className="text-sm text-amber-800 font-medium">
                  {nbSansPlanning} rayon{nbSansPlanning > 1 ? 's' : ''} sans planning
                </span>
              </div>
              <button onClick={ouvrirNotifications} className="text-xs text-amber-700 font-medium hover:text-amber-900">Voir →</button>
            </div>
          )}

          <Routes>
            <Route path="/" element={<Navigate to={estAccueil ? '/consolidation' : '/dashboard'} replace />} />
            <Route path="/dashboard" element={estAccueil ? <Navigate to="/consolidation" replace /> : <Dashboard />} />
            <Route path="/planning" element={estAccueil ? <Navigate to="/consolidation" replace /> : <Planning />} />
            <Route path="/encadrement" element={(isAdmin || isChefDep) ? <PlanningEncadrement /> : <Navigate to="/dashboard" replace />} />
            <Route path="/direction" element={isAdmin ? <PlanningDirection /> : <Navigate to="/dashboard" replace />} />
            <Route path="/validation" element={estAccueil ? <Navigate to="/consolidation" replace /> : <Validation />} />
            <Route path="/historique" element={estAccueil ? <Navigate to="/consolidation" replace /> : <Historique />} />
            <Route path="/consolidation" element={(isAdmin || isChefDep || estAccueil) ? <Consolidation /> : <Navigate to="/dashboard" replace />} />
            <Route path="/reports" element={estAccueil ? <Navigate to="/consolidation" replace /> : <Rapports />} />
            <Route path="/profil" element={<Profil />} />
            <Route path="/admin" element={isAdmin ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button onClick={() => navigate('/admin/utilisateurs')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                  <UserCog className="w-8 h-8 mb-3 text-purple-600" />
                  <div className="font-semibold">Utilisateurs</div>
                  <div className="text-xs text-gray-500 mt-1">Créer et gérer les comptes</div>
                </button>
                <button onClick={() => navigate('/admin/collaborateurs')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                  <Users className="w-8 h-8 mb-3 text-blue-600" />
                  <div className="font-semibold">Collaborateurs</div>
                  <div className="text-xs text-gray-500 mt-1">Ajouter, modifier, supprimer</div>
                </button>
                <button onClick={() => setShowImport(true)} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                  <FileText className="w-8 h-8 mb-3 text-emerald-600" />
                  <div className="font-semibold">Import Excel</div>
                  <div className="text-xs text-gray-500 mt-1">Importer depuis un fichier .xlsx</div>
                </button>
                <button onClick={() => navigate('/admin/rayons')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                  <Settings className="w-8 h-8 mb-3 text-amber-600" />
                  <div className="font-semibold">Rayons</div>
                  <div className="text-xs text-gray-500 mt-1">Gérer les rayons</div>
                </button>
                <button onClick={() => navigate('/admin/departements')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                  <Building2 className="w-8 h-8 mb-3 text-purple-600" />
                  <div className="font-semibold">Départements</div>
                  <div className="text-xs text-gray-500 mt-1">Gérer les départements</div>
                </button>
                <button onClick={() => navigate('/admin/reinitialisation')} className="p-6 bg-white border border-red-100 rounded-2xl hover:shadow-md hover:border-red-300 transition text-left sm:col-span-2">
                  <Trash2 className="w-8 h-8 mb-3 text-red-600" />
                  <div className="font-semibold text-red-700">Réinitialisation</div>
                  <div className="text-xs text-gray-500 mt-1">Effacer comptes, collaborateurs et plannings pour repartir de zéro</div>
                </button>
              </div>
            ) : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/utilisateurs" element={isAdmin ? <Utilisateurs /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/collaborateurs" element={isAdmin ? <Collaborateurs /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/rayons" element={isAdmin ? <Rayons /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/departements" element={isAdmin ? <Departements /> : <Navigate to="/dashboard" replace />} />
            <Route path="/admin/reinitialisation" element={isAdmin ? <Reinitialisation /> : <Navigate to="/dashboard" replace />} />
            <Route path="*" element={<Navigate to={estAccueil ? '/consolidation' : '/dashboard'} replace />} />
          </Routes>
        </div>
      </div>

      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30">
        <div className="flex items-center">
          {bottomNav.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const badge = item.id === 'planning' ? nbPlanningBadge : item.id === 'validation' ? nbAValider : 0;
            return (
              <button key={item.id} onClick={() => handleNav(item.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
                {badge > 0 && (
                  <span className="absolute top-1.5 right-4 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
                {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />}
              </button>
            );
          })}
          <button onClick={() => setShowMore(true)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${['encadrement', 'direction', 'consolidation', 'admin', 'reports', 'profil'].includes(activeTab) ? 'text-blue-600' : 'text-gray-400'}`}>
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-xs font-medium">Plus</span>
          </button>
        </div>
      </div>

      <AssistantWidget />
    </div>
  );
}

function App() {
  const { session, profile, loading, profileIncomplete, recoveryMode, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

  if (recoveryMode) return <NouveauMotDePasse />;

  if (profileIncomplete) {
    return (
      <FullScreenMessage
        title="Profil en attente de configuration"
        body="Votre rôle n'a pas encore été défini. Contactez un administrateur."
        onSignOut={() => void signOut()}
      />
    );
  }

  if (profile && !profile.actif) {
    return (
      <FullScreenMessage
        title="Compte désactivé"
        body="Votre accès a été désactivé. Contactez un administrateur."
        onSignOut={() => void signOut()}
      />
    );
  }

  return (
    <AssistantProvider>
      <AppShell />
    </AssistantProvider>
  );
}

export default App;