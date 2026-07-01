import { useState } from 'react';
import { Users, Calendar, BarChart3, FileText, Settings, LogOut, Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import Login from './pages/Login';
import { ROLE_LABELS, canAccessAdmin } from './types';

function FullScreenMessage({
  title,
  body,
  onSignOut,
}: {
  title: string;
  body: string;
  onSignOut: () => void;
}) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl shadow-sm border border-gray-100 p-8 max-w-md text-center">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
        <p className="text-sm text-gray-500 mb-6">{body}</p>
        <button
          onClick={onSignOut}
          className="text-sm font-medium text-red-600 hover:bg-red-50 px-4 py-2 rounded-xl transition"
        >
          Déconnexion
        </button>
      </div>
    </div>
  );
}

function AppShell() {
  const { profile, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'dashboard' | 'planning' | 'admin' | 'reports'>('dashboard');

  if (!profile) return null;

  const isAdmin = canAccessAdmin(profile.role);
  const fullName = `${profile.prenom} ${profile.nom}`.trim();

  const menuItems = [
    { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
    { id: 'planning', label: 'Planning', icon: Calendar },
    { id: 'admin', label: 'Administration', icon: Users, adminOnly: true },
    { id: 'reports', label: 'Rapports', icon: FileText },
  ] as const;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="fixed inset-y-0 left-0 w-72 bg-white border-r border-gray-200 shadow-xl z-50">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl">
              P
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Planning</h1>
              <p className="text-sm text-gray-500">Marjane Tanger</p>
            </div>
          </div>

          <nav className="space-y-1">
            {menuItems.map((item) => {
              if ('adminOnly' in item && item.adminOnly && !isAdmin) return null;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'hover:bg-gray-100 text-gray-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="absolute bottom-6 left-6 right-6">
          <div className="bg-gray-50 p-4 rounded-2xl">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600">
                👋
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">{fullName || 'Utilisateur'}</p>
                <p className="text-xs text-gray-500">{ROLE_LABELS[profile.role]}</p>
              </div>
            </div>
            <button
              onClick={() => void signOut()}
              className="mt-4 w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 py-2 rounded-xl text-sm font-medium"
            >
              <LogOut className="w-4 h-4" />
              Déconnexion
            </button>
          </div>
        </div>
      </div>

      <div className="ml-72 p-8">
        <header className="mb-10">
          <h2 className="text-3xl font-bold text-gray-900">
            {activeTab === 'dashboard' && 'Tableau de Bord'}
            {activeTab === 'planning' && 'Gestion des Plannings'}
            {activeTab === 'admin' && 'Administration'}
            {activeTab === 'reports' && 'Rapports'}
          </h2>
          <p className="text-gray-600 mt-1">Bienvenue, {fullName}</p>
        </header>

        {activeTab === 'dashboard' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold mb-6">Plannings Validés</h3>
              <div className="text-6xl font-bold text-emerald-600">—</div>
              <p className="text-sm text-gray-500 mt-2">Cette semaine</p>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold mb-6">Heures Planifiées</h3>
              <div className="text-6xl font-bold text-blue-600">—</div>
              <p className="text-sm text-gray-500 mt-2">Ce mois</p>
            </div>
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold mb-6">Rayons Actifs</h3>
              <div className="text-6xl font-bold text-amber-600">—</div>
              <p className="text-sm text-gray-500 mt-2">Sur le périmètre</p>
            </div>
          </div>
        )}

        {activeTab === 'planning' && (
          <div className="bg-white rounded-3xl shadow-sm p-8">
            <div className="flex justify-between mb-8">
              <h3 className="text-2xl font-semibold">Planning Hebdomadaire</h3>
              <button className="bg-blue-600 text-white px-6 py-3 rounded-2xl font-medium hover:bg-blue-700 transition">
                + Nouveau Planning
              </button>
            </div>
            <div className="text-center py-20 text-gray-400">
              Interface planning à venir.
            </div>
          </div>
        )}

        {activeTab === 'admin' && isAdmin && (
          <div className="bg-white rounded-3xl p-8">
            <h3 className="text-2xl font-semibold mb-8">Administration</h3>
            <div className="grid grid-cols-2 gap-6">
              <button className="p-8 border-2 border-dashed border-gray-300 rounded-3xl hover:border-blue-400 transition text-left">
                <Users className="w-10 h-10 mb-4 text-blue-600" />
                <div className="font-semibold">Importer Collaborateurs</div>
                <div className="text-sm text-gray-500">Via fichier Excel</div>
              </button>
              <button className="p-8 border-2 border-dashed border-gray-300 rounded-3xl hover:border-blue-400 transition text-left">
                <Settings className="w-10 h-10 mb-4 text-blue-600" />
                <div className="font-semibold">Gestion des Rayons</div>
                <div className="text-sm text-gray-500">Départements &amp; Rayons</div>
              </button>
            </div>
          </div>
        )}

        {activeTab === 'reports' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-8 rounded-3xl">Planning Journalier</div>
            <div className="bg-white p-8 rounded-3xl">Rapport Mensuel</div>
          </div>
        )}
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
