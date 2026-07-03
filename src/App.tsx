import { useState } from 'react';
import { Users, Calendar, BarChart3, FileText, Settings, LogOut, Loader2, Menu, X, UserCog, LayoutGrid, Building2, User } from 'lucide-react';
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
import { ROLE_LABELS, canAccessAdmin } from './types';

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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'consolidation' | 'admin' | 'reports' | 'profil'>('dashboard');
  const [adminSection, setAdminSection] = useState<'menu' | 'collaborateurs' | 'utilisateurs' | 'rayons' | 'departements'>('menu');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showImport, setShowImport] = useState(false);

  if (!profile) return null;

  const isAdmin = canAccessAdmin(profile.role);
  const isChefDep = profile.role === 'chef_departement';
  const fullName = `${profile.prenom} ${profile.nom}`.trim();

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
    { id: 'planning', label: 'Planning', icon: Calendar },
    { id: 'consolidation', label: 'Consolidation', icon: LayoutGrid, depOnly: true },
    { id: 'admin', label: 'Administration', icon: Users, adminOnly: true },
    { id: 'reports', label: 'Rapports', icon: FileText },
  ] as const;

  function handleNav(id: typeof activeTab) {
    setActiveTab(id);
    setAdminSection('menu');
    setSidebarOpen(false);
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
    planning: 'Planning Hebdomadaire',
    consolidation: 'Consolidation Département',
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
              <button
                key={item.id}
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                  activeTab === item.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-6">
        <div className="bg-gray-50 p-4 rounded-2xl">
          <button
            onClick={() => handleNav('profil')}
            className={`w-full flex items-center gap-3 mb-3 p-2 rounded-xl transition ${
              activeTab === 'profil' ? 'bg-blue-50' : 'hover:bg-gray-100'
            }`}
          >
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-medium text-sm truncate">{fullName || 'Utilisateur'}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[profile.role]}</p>
            </div>
          </button>
          <button
            onClick={() => void signOut()}
            className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 py-2 rounded-xl text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">

      {showImport && <ImportCollaborateurs onClose={() => setShowImport(false)} />}

      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:w-72 lg:flex lg:flex-col bg-white border-r border-gray-200 shadow-xl z-50">
        <Sidebar />
      </div>

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

      <div className="lg:ml-72">
        <div className="lg:hidden flex items-center gap-3 px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-30">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl hover:bg-gray-100">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">P</div>
            <span className="font-semibold text-gray-900">Planning</span>
          </div>
        </div>

        <div className="p-4 lg:p-8">
          <header className="mb-6 lg:mb-8">
            <div className="flex items-center gap-2">
              {activeTab === 'admin' && adminSection !== 'menu' && (
                <button
                  onClick={() => setAdminSection('menu')}
                  className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 text-lg"
                >
                  ←
                </button>
              )}
              <div>
                <h2 className="text-2xl lg:text-3xl font-bold text-gray-900">
                  {pageTitle[activeTab]}
                </h2>
                <p className="text-gray-500 mt-1 text-sm">Bienvenue, {fullName}</p>
              </div>
            </div>
          </header>

          {activeTab === 'dashboard' && <Dashboard />}
          {activeTab === 'planning' && <Planning />}
          {activeTab === 'consolidation' && (isAdmin || isChefDep) && <Consolidation />}
          {activeTab === 'reports' && <Rapports />}
          {activeTab === 'profil' && <Profil />}

          {activeTab === 'admin' && isAdmin && (
            <>
              {adminSection === 'menu' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setAdminSection('utilisateurs')}
                    className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left"
                  >
                    <UserCog className="w-8 h-8 mb-3 text-purple-600" />
                    <div className="font-semibold">Utilisateurs</div>
                    <div className="text-xs text-gray-500 mt-1">Créer et gérer les comptes</div>
                  </button>
                  <button
                    onClick={() => setAdminSection('collaborateurs')}
                    className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left"
                  >
                    <Users className="w-8 h-8 mb-3 text-blue-600" />
                    <div className="font-semibold">Collaborateurs</div>
                    <div className="text-xs text-gray-500 mt-1">Ajouter, modifier, supprimer</div>
                  </button>
                  <button
                    onClick={() => setShowImport(true)}
                    className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left"
                  >
                    <FileText className="w-8 h-8 mb-3 text-emerald-600" />
                    <div className="font-semibold">Import Excel</div>
                    <div className="text-xs text-gray-500 mt-1">Importer depuis un fichier .xlsx</div>
                  </button>
                  <button
                    onClick={() => setAdminSection('rayons')}
                    className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left"
                  >
                    <Settings className="w-8 h-8 mb-3 text-amber-600" />
                    <div className="font-semibold">Rayons</div>
                    <div className="text-xs text-gray-500 mt-1">Gérer les rayons</div>
                  </button>
                  <button
                    onClick={() => setAdminSection('departements')}
                    className="p-6 bg-white border border-gray-100 rounded-2xl hover:shadow-md hover:border-blue-200 transition text-left"
                  >
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
