import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
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
const MAX_MESSAGES = 50;

export function AssistantProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [anomalies, setAnomalies] = useState<Anomalie[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', text: "Bonjour 👋 Je surveille automatiquement les plannings (double affectation, repos hebdomadaire) dans la limite de ce que vous pouvez consulter. Tapez \"vérifie\" à tout moment pour lancer un contrôle." },
  ]);
  const [checking, setChecking] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpenState] = useState(false);

  const checkingRef = useRef(false); // évite les vérifications concurrentes (état "checking" seul est sujet aux closures obsolètes)
  const lastDateRef = useRef<Date>(new Date()); // mémorise la dernière semaine vérifiée, pour que "vérifie" tapé au clavier porte sur la même semaine que la dernière sauvegarde
  const msgCounterRef = useRef(0);
  const nextId = (prefix: string) => `${prefix}_${Date.now()}_${msgCounterRef.current++}`;

  const pushMessage = useCallback((msg: Omit<ChatMessage, 'id'> & { id?: string }) => {
    setMessages(prev => {
      const next = [...prev, { id: msg.id ?? nextId(msg.role), role: msg.role, text: msg.text }];
      return next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next;
    });
  }, []);

  const setOpen = useCallback((v: boolean) => {
    setOpenState(v);
    if (v) setUnreadCount(0);
  }, []);

  const runCheck = useCallback(async (date?: Date) => {
    if (!profile) return;
    if (checkingRef.current) return; // une vérification est déjà en cours, on ignore ce nouvel appel
    checkingRef.current = true;
    setChecking(true);
    const effectiveDate = date ?? lastDateRef.current;
    lastDateRef.current = effectiveDate;
    try {
      const found = await detecterAnomalies(profile, effectiveDate);
      setAnomalies(found);
      if (found.length === 0) {
        pushMessage({ role: 'assistant', text: '✅ Aucune anomalie détectée sur cette semaine.' });
      } else {
        const lines = found.map(a => `• ${a.message}`).join('\n');
        pushMessage({ role: 'assistant', text: `⚠️ ${found.length} anomalie(s) détectée(s) :\n${lines}` });
        setUnreadCount(c => c + found.length);
      }
    } catch (err: any) {
      pushMessage({ role: 'assistant', text: `Erreur pendant la vérification : ${err?.message ?? err}` });
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, [profile, pushMessage]);

  const askUser = useCallback((text: string) => {
    pushMessage({ role: 'user', text });
    const t = text.trim().toLowerCase();
    if (t.includes('vérifi') || t.includes('verifi') || t.includes('check')) {
      void runCheck();
    } else {
      pushMessage({ role: 'assistant', text: "Je peux surveiller : double affectation et repos hebdomadaire manquant. Tapez \"vérifie\" pour lancer un contrôle sur la semaine en cours." });
    }
  }, [runCheck, pushMessage]);

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
