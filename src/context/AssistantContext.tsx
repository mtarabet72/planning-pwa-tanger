import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { detecterAnomalies, type Anomalie } from '../lib/anomalies';
import { useAuth } from './AuthContext';

interface ChatMessage {
  id: string;
  role: 'assistant' | 'user';
  text: string;
}

interface AssistantContextValue {
  anomalies: Anomalie[];
  messages: ChatMessage[];
  checking: boolean;
  unreadCount: number;
  open: boolean;
  setOpen: (open: boolean) => void;
  runCheck: (date?: Date) => Promise<void>;
  askUser: (text: string) => void;
}

const AssistantContext = createContext<AssistantContextValue | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [anomalies, setAnomalies] = useState<Anomalie[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: "Bonjour 👋 Je surveille automatiquement les plannings (double affectation, repos hebdomadaire) dans la limite de ce que vous pouvez consulter. Tapez \"vérifie\" à tout moment pour lancer un contrôle." },
  ]);
  const [checking, setChecking] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpenState] = useState(false);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (v) setUnreadCount(0);
  }, []);

  const runCheck = useCallback(async (date?: Date) => {
    if (!profile) return;
    setChecking(true);
    try {
      const found = await detecterAnomalies(profile, date ?? new Date());
      setAnomalies(found);
      if (found.length === 0) {
        setMessages(prev => [...prev, {
          id: `check_${Date.now()}`,
          role: 'assistant',
          text: '✅ Aucune anomalie détectée sur cette semaine.',
        }]);
      } else {
        const lines = found.map(a => `• ${a.message}`).join('\n');
        setMessages(prev => [...prev, {
          id: `check_${Date.now()}`,
          role: 'assistant',
          text: `⚠️ ${found.length} anomalie(s) détectée(s) :\n${lines}`,
        }]);
        setUnreadCount(c => c + found.length);
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `err_${Date.now()}`,
        role: 'assistant',
        text: `Erreur pendant la vérification : ${err?.message ?? err}`,
      }]);
    } finally {
      setChecking(false);
    }
  }, [profile]);

  const askUser = useCallback((text: string) => {
    setMessages(prev => [...prev, { id: `u_${Date.now()}`, role: 'user', text }]);
    const t = text.trim().toLowerCase();
    if (t.includes('vérifi') || t.includes('verifi') || t.includes('check')) {
      void runCheck();
    } else {
      setMessages(prev => [...prev, {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: "Je peux surveiller : double affectation et repos hebdomadaire manquant. Tapez \"vérifie\" pour lancer un contrôle sur la semaine en cours.",
      }]);
    }
  }, [runCheck]);

  return (
    <AssistantContext.Provider value={{ anomalies, messages, checking, unreadCount, open, setOpen, runCheck, askUser }}>
      {children}
    </AssistantContext.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant doit être utilisé dans un AssistantProvider');
  return ctx;
}
