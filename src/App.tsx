import { useState } from 'react';
import { Users, Calendar, BarChart3, FileText, Settings, LogOut, Loader2, Menu, X, UserCog, LayoutGrid, Building2, User, Bell, ClipboardCheck, History, MoreHorizontal } from 'lucide-react';
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
import { ROLE_LABELS, canAccessAdmin } from './types';
import { useNotifications } from './hooks/useNotifications';

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

function AppShell() {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'validation' | 'historique' | 'consolidation' | 'admin' | 'reports' | 'profil'>('dashboard');
  const [adminSection, setAdminSection] = useState<'menu' | 'collaborateurs' | 'utilisateurs' | 'rayons' | 'departements'>('menu');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMore, setShowMore] = useState(false);

  const { rayonsSansPlanning, count: notifCount } = useNotifications(profile);

  if (!profile) return null;

  const isAdmin = canAccessAdmin(profile.role);
  const isChefDep = profile.role === 'chef_departement';
  const fullName = `${profile.prenom} ${profile.nom}`.trim();

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
    { id: 'planning', label: 'Planning', icon: Calendar },
    { id: 'validation', label: 'Validation', icon: ClipboardCheck },
    { id: 'historique', label: 'Historique', icon: History },
    { id: 'consolidation', label: 'Consolidation', icon: LayoutGrid, depOnly: true },
    { id: 'admin', label: 'Administration', icon: Users, adminOnly: true },
    { id: 'reports', label: 'Rapports', icon: FileText },
  ] as const;

  // Bottom nav : 4 onglets principaux + "Plus"
  const bottomNav = [
    { id: 'dashboard', label: 'Accueil', icon: BarChart3 },
    { id: 'planning', label: 'Planning', icon: Calendar },
    { id: 'validation', label: 'Validation', icon: ClipboardCheck },
    { id: 'historique', label: 'Historique', icon: History },
  ] as const;

  function handleNav(id: typeof activeTab) {
    setActiveTab(id);
    setAdminSection('menu');
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
  };

  const pageTitle: Record<typeof activeTab, string> = {
    dashboard: 'Tableau de Bord',
    planning: 'Planning',
    validation: 'Validation',
    historique: 'Historique',
    consolidation: 'Consolidation',
    admin: adminTitle[adminSection],
    reports: 'Rapports',
    profil: 'Mon Profil',
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full">
      <div className="p-6 flex-1">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">P</div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Planning</h1>
            <p className="text-xs text-gray-500">Marjane Tanger</p>
          </div>
        </div>
        <nav className="space-y-1">
          {menuItems.map((item) => {
            if ('adminOnly' in item && item.adminOnly && !isAdmin) return null;
            if ('depOnly' in item && item.depOnly && !isAdmin && !isChefDep) return null;
            const Icon = item.icon;
            return (
              <button key={item.id} onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === item.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                <Icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {item.id === 'planning' && notifCount > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-6">
        <div className="bg-gray-50 p-4 rounded-2xl">
          <button onClick={() => handleNav('profil')}
            className={`w-full flex items-center gap-3 mb-3 p-2 rounded-xl transition ${activeTab === 'profil' ? 'bg-blue-50' : 'hover:bg-gray-100'}`}>
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-medium text-sm truncate">{fullName || 'Utilisateur'}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[profile.role]}</p>
            </div>
          </button>
          <button onClick={() => void signOut()}
            className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 py-2 rounded-xl text-sm font-medium">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {showImport && <ImportCollaborateurs onClose={() => setShowImport(false)} />}

      {/* Panneau notifications */}
      {showNotifications && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/20" onClick={() => setShowNotifications(false)} />
          <div className="absolute right-4 top-16 lg:top-20 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-600" />
                <span className="font-semibold text-sm">Rayons sans planning</span>
              </div>
              <button onClick={() => setShowNotifications(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4" />
              </button>
            </div>
            {rayonsSansPlanning.length === 0 ? (
              <div className="p-6 text-center">
                <div className="text-2xl mb-2">✅</div>
                <p className="text-sm text-gray-500">Tous les rayons sont planifiés cette semaine.</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
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
            )}
            {rayonsSansPlanning.length > 0 && (
              <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
                <button onClick={() => handleNav('planning')} className="w-full text-sm text-blue-600 font-medium text-center hover:text-blue-700">
                  Aller au Planning →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Menu "Plus" mobile */}
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
              <button onClick={() => handleNav('reports')}
                className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition ${activeTab === 'reports' ? 'bg-blue-50 border-blue-200' : 'border-gray-100 hover:bg-gray-50'}`}>
                <FileText className="w-6 h-6 text-emerald-600" />
                <span className="text-xs font-medium text-gray-700">Rapports</span>
              </button>
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

      {/* Sidebar desktop */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:flex lg:flex-col bg-white border-r border-gray-200 shadow-xl z-40">
        <Sidebar />
      </div>

      {/* Sidebar mobile (hamburger) */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl z-50">
            <button onClick={() => setSidebarOpen(false)} className="absolute top-4 right-4 p-2 rounded-xl hover:bg-gray-100">
              <X className="w-5 h-5" />
            </button>
            <Sidebar />
          </div>
        </div>
      )}

      <div className="lg:ml-72 pb-20 lg:pb-0">

        {/* Header mobile */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 sticky top-0 z-30">
          <div className="flex items-center gap-2 flex-1">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
            <span className="font-semibold text-gray-900 text-sm">{pageTitle[activeTab]}</span>
          </div>
          <button onClick={() => setShowNotifications(v => !v)} className="relative p-2 rounded-xl hover:bg-gray-100">
            <Bell className="w-5 h-5 text-gray-600" />
            {notifCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {notifCount > 9 ? '9+' : notifCount}
              </span>
            )}
          </button>
        </div>

        <div className="p-4 lg:p-8">

          {/* Header desktop */}
          <header className="hidden lg:flex items-center justify-between mb-8">
            <div className="flex items-center gap-2">
              {activeTab === 'admin' && adminSection !== 'menu' && (
                <button onClick={() => setAdminSection('menu')} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 text-lg">←</button>
              )}
              <div>
                <h2 className="text-3xl font-bold text-gray-900">{pageTitle[activeTab]}</h2>
                <p className="text-gray-500 mt-1 text-sm">Bienvenue, {fullName}</p>
              </div>
            </div>
            <button onClick={() => setShowNotifications(v => !v)} className="relative p-3 rounded-xl hover:bg-gray-100 transition">
              <Bell className="w-5 h-5 text-gray-600" />
              {notifCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                  {notifCount > 9 ? '9+' : notifCount}
                </span>
              )}
            </button>
          </header>

          {/* Bandeau alerte */}
          {notifCount > 0 && (activeTab === 'dashboard' || activeTab === 'planning') && (
            <div className="mb-4 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-amber-600">⚠️</span>
                <span className="text-sm text-amber-800 font-medium">
                  {notifCount} rayon{notifCount > 1 ? 's' : ''} sans planning
                </span>
              </div>
              <button onClick={() => setShowNotifications(true)} className="text-xs text-amber-700 font-medium hover:text-amber-900">Voir →</button>
            </div>
          )}

          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'planning' && <Planning />}
          {activeTab === 'validation' && <Validation />}
          {activeTab === 'historique' && <Historique />}
          {activeTab === 'consolidation' && (isAdmin || isChefDep) && <Consolidation />}
          {activeTab === 'reports' && <Rapports />}
          {activeTab === 'profil' && <Profil />}

          {activeTab === 'admin' && isAdmin && (
            <>
              {adminSection === 'menu' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button onClick={() => setAdminSection('utilisateurs')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                    <UserCog className="w-8 h-8 mb-3 text-purple-600" />
                    <div className="font-semibold">Utilisateurs</div>
                    <div className="text-xs text-gray-500 mt-1">Créer et gérer les comptes</div>
                  </button>
                  <button onClick={() => setAdminSection('collaborateurs')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                    <Users className="w-8 h-8 mb-3 text-blue-600" />
                    <div className="font-semibold">Collaborateurs</div>
                    <div className="text-xs text-gray-500 mt-1">Ajouter, modifier, supprimer</div>
                  </button>
                  <button onClick={() => setShowImport(true)} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                    <FileText className="w-8 h-8 mb-3 text-emerald-600" />
                    <div className="font-semibold">Import Excel</div>
                    <div className="text-xs text-gray-500 mt-1">Importer depuis un fichier .xlsx</div>
                  </button>
                  <button onClick={() => setAdminSection('rayons')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                    <Settings className="w-8 h-8 mb-3 text-amber-600" />
                    <div className="font-semibold">Rayons</div>
                    <div className="text-xs text-gray-500 mt-1">Gérer les rayons</div>
                  </button>
                  <button onClick={() => setAdminSection('departements')} className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left">
                    <Building2 className="w-8 h-8 mb-3 text-purple-600" />
                    <div className="font-semibold">Départements</div>
                    <div className="text-xs text-gray-500 mt-1">Gérer les départements</div>
                  </button>
                </div>
              )}
              {adminSection === 'utilisateurs' && <Utilisateurs />}
              {adminSection === 'collaborateurs' && <Collaborateurs />}
              {adminSection === 'rayons' && <Rayons />}
              {adminSection === 'departements' && <Departements />}
            </>
          )}
        </div>
      </div>

      {/* Bottom Navigation Mobile */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 z-30 safe-bottom">
        <div className="flex items-center">
          {bottomNav.map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button key={item.id} onClick={() => handleNav(item.id)}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors relative ${isActive ? 'text-blue-600' : 'text-gray-400'}`}>
                <Icon className="w-5 h-5" />
                <span className="text-xs font-medium">{item.label}</span>
                {item.id === 'planning' && notifCount > 0 && (
                  <span className="absolute top-1.5 right-4 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
                {isActive && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-blue-600 rounded-full" />}
              </button>
            );
          })}
          <button onClick={() => setShowMore(true)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2.5 transition-colors ${['consolidation', 'admin', 'reports', 'profil'].includes(activeTab) ? 'text-blue-600' : 'text-gray-400'}`}>
            <MoreHorizontal className="w-5 h-5" />
            <span className="text-xs font-medium">Plus</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function App() {
  const { session, profile, loading, profileIncomplete, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    );
  }

  if (!session) return <Login />;

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

  return <AppShell />;
}

export default App;
