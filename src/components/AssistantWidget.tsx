import { useEffect, useRef, useState } from 'react';
import { Bot, X, Send, Loader2, ShieldAlert } from 'lucide-react';
import { useAssistant } from '../context/AssistantContext';

export default function AssistantWidget() {
  const { messages, checking, unreadCount, open, setOpen, runCheck, askUser } = useAssistant();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, checking, open]);

  function handleSend() {
    const text = input.trim();
    if (!text) return;
    askUser(text);
    setInput('');
  }

  return (
    <>
      {/* Bouton flottant */}
      <button
        onClick={() => setOpen(!open)}
        className="fixed bottom-20 lg:bottom-6 right-4 lg:right-6 z-40 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-lg flex items-center justify-center text-white transition-transform hover:scale-105"
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
        {!open && unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Panneau de chat */}
      {open && (
        <div className="fixed bottom-36 lg:bottom-24 right-4 lg:right-6 z-40 w-[calc(100%-2rem)] max-w-sm h-[28rem] bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-blue-600 text-white">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4" />
              <span className="font-semibold text-sm">Assistant Planning</span>
            </div>
            <button onClick={() => runCheck()} disabled={checking}
              className="flex items-center gap-1 text-xs bg-white/15 hover:bg-white/25 disabled:opacity-50 disabled:cursor-not-allowed px-2 py-1 rounded-lg">
              {checking ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
              Vérifier
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {messages.map(m => (
              <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-line ${
                  m.role === 'user' ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}
            {checking && (
              <div className="flex justify-start">
                <div className="bg-gray-100 text-gray-500 rounded-2xl rounded-bl-sm px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="w-3 h-3 animate-spin" /> Vérification en cours...
                </div>
              </div>
            )}
            <div ref={scrollRef} />
          </div>

          <div className="p-2 border-t border-gray-100 flex items-center gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSend(); }}
              placeholder="Écrire un message..."
              className="flex-1 text-sm px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:border-blue-400"
            />
            <button onClick={handleSend} className="p-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
