import { Users, Calendar, BarChart3, FileText, LogOut, LayoutGrid, User, ClipboardCheck, History, Users2, Crown } from 'lucide-react';
import { ROLE_LABELS, type Role, type Tab } from '../types';

const MENU_ITEMS = [
  { id: 'dashboard', label: 'Tableau de Bord', icon: BarChart3 },
  { id: 'planning', label: 'Planning', icon: Calendar },
  { id: 'encadrement', label: 'Encadrement', icon: Users2, depOnly: true },
  { id: 'direction', label: 'Permanence & Direction', icon: Crown, adminOnly: true },
  { id: 'validation', label: 'Validation', icon: ClipboardCheck },
  { id: 'historique', label: 'Historique', icon: History },
  { id: 'consolidation', label: 'Consolidation', icon: LayoutGrid, depOnly: true },
  { id: 'admin', label: 'Administration', icon: Users, adminOnly: true },
  { id: 'reports', label: 'Rapports', icon: FileText },
] as const satisfies ReadonlyArray<{ id: Tab; label: string; icon: unknown; depOnly?: boolean; adminOnly?: boolean }>;

interface SidebarProps {
  activeTab: Tab;
  onNav: (tab: Tab) => void;
  onSignOut: () => void;
  isAdmin: boolean;
  isChefDep: boolean;
  fullName: string;
  role: Role;
  /** Nombre de rayons sans planning cette semaine (badge sur l'onglet Planning). */
  planningBadge: number;
  /** Nombre de plannings en attente de validation par l'utilisateur (badge sur l'onglet Validation). */
  validationBadge: number;
}

/**
 * Menu latéral (desktop + tiroir mobile).
 * Composant autonome : déclaré hors de AppShell pour que React ne le remonte pas à chaque rendu.
 */
export default function Sidebar({ activeTab, onNav, onSignOut, isAdmin, isChefDep, fullName, role, planningBadge, validationBadge }: SidebarProps) {
  return (
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
          {MENU_ITEMS.map((item) => {
            if ('adminOnly' in item && item.adminOnly && !isAdmin) return null;
            if ('depOnly' in item && item.depOnly && !isAdmin && !isChefDep) return null;
            const Icon = item.icon;
            const badge = item.id === 'planning' ? planningBadge : item.id === 'validation' ? validationBadge : 0;
            return (
              <button key={item.id} onClick={() => onNav(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${activeTab === item.id ? 'bg-blue-50 text-blue-700 font-medium' : 'hover:bg-gray-100 text-gray-700'}`}>
                <Icon className="w-5 h-5 shrink-0" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold shrink-0">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
      <div className="p-6">
        <div className="bg-gray-50 p-4 rounded-2xl">
          <button onClick={() => onNav('profil')}
            className={`w-full flex items-center gap-3 mb-3 p-2 rounded-xl transition ${activeTab === 'profil' ? 'bg-blue-50' : 'hover:bg-gray-100'}`}>
            <div className="w-9 h-9 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 shrink-0">
              <User className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="font-medium text-sm truncate">{fullName || 'Utilisateur'}</p>
              <p className="text-xs text-gray-500">{ROLE_LABELS[role]}</p>
            </div>
          </button>
          <button onClick={onSignOut}
            className="w-full flex items-center justify-center gap-2 text-red-600 hover:bg-red-50 py-2 rounded-xl text-sm font-medium">
            <LogOut className="w-4 h-4" /> Déconnexion
          </button>
        </div>
      </div>
    </div>
  );
}
