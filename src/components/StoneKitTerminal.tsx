import React, { useState, useEffect } from 'react';
import { Terminal, X, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { toast } from 'sonner';

export default function StoneKitTerminal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'sessions' | 'requests' | 'feedback'>('sessions');
  const [games, setGames] = useState<any[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<any[]>([]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle on Ctrl + Shift + D
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const unsubGames = onSnapshot(query(collection(db, 'games'), where('status', 'in', ['lobby', 'active'])), snap => {
      setGames(snap.docs.map(g => ({ id: g.id, ...g.data() })));
    });

    const unsubReqs = onSnapshot(collection(db, 'game_requests'), snap => {
      setRequests(snap.docs.map(r => ({ id: r.id, ...r.data() })));
    });

    const unsubFeed = onSnapshot(collection(db, 'feedback'), snap => {
      setFeedback(snap.docs.map(r => ({ id: r.id, ...r.data() })));
    });

    return () => {
      unsubGames();
      unsubReqs();
      unsubFeed();
    };
  }, [isOpen]);

  const killSession = async (code: string) => {
    await updateDoc(doc(db, 'games', code), { status: 'finished' });
    toast.success(`Killed game ${code}`);
  };

  const [selectedGame, setSelectedGame] = useState<string | null>(null);
  const [gamePlayers, setGamePlayers] = useState<any[]>([]);

  useEffect(() => {
    if (!selectedGame || activeTab !== 'sessions') return;
    const unsub = onSnapshot(collection(db, `games/${selectedGame}/players`), snap => {
      setGamePlayers(snap.docs.map(p => ({ id: p.id, ...p.data() })));
    });
    return unsub;
  }, [selectedGame, activeTab]);

  const banPlayer = async (playerId: string) => {
    await updateDoc(doc(db, `games/${selectedGame}/players`, playerId), { isBanned: true });
    toast.success(`Banned ${playerId}`);
  };

  const unbanPlayer = async (playerId: string) => {
    await updateDoc(doc(db, `games/${selectedGame}/players`, playerId), { isBanned: false, lockoutTimestamp: null });
    toast.success(`Unbanned ${playerId}`);
  };

  const generateWeekly4 = async () => {
    const validReqs = requests.map(r => r.text).filter((t: string) => t?.length > 3);
    const shuffled = validReqs.sort(() => 0.5 - Math.random());
    const top4 = shuffled.slice(0, 4);
    if (top4.length === 0) {
      toast.error("No valid requests");
      return;
    }
    await setDoc(doc(db, 'settings', 'voting'), {
      activeOptions: top4.map((t: string) => ({ text: t, votes: 0 })),
      updatedAt: serverTimestamp()
    });
    toast.success("Generated Weekly 4!");
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="fixed bottom-0 left-0 right-0 h-[60vh] bg-black/95 border-t-2 border-purple-500 font-mono z-[100] shadow-[0_-10px_40px_rgba(168,85,247,0.2)] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 py-3 bg-black/50 border-b border-purple-900/50">
          <div className="flex gap-4">
            <span className="text-purple-500 font-bold uppercase tracking-widest text-sm flex items-center">
              <Terminal className="w-4 h-4 mr-2" /> ADMIN COMMAND CENTER
            </span>
            <div className="flex gap-2">
              <button onClick={() => setActiveTab('sessions')} className={`px-3 py-1 rounded text-xs font-bold uppercase ${activeTab === 'sessions' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-500 hover:text-white'}`}>Active Sessions</button>
              <button onClick={() => setActiveTab('requests')} className={`px-3 py-1 rounded text-xs font-bold uppercase ${activeTab === 'requests' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-500 hover:text-white'}`}>Game Mode Requests</button>
              <button onClick={() => setActiveTab('feedback')} className={`px-3 py-1 rounded text-xs font-bold uppercase ${activeTab === 'feedback' ? 'bg-purple-500/20 text-purple-300' : 'text-gray-500 hover:text-white'}`}>User Feedback</button>
            </div>
          </div>
          <button onClick={() => setIsOpen(false)} className="text-purple-500 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 text-sm text-white">
          {activeTab === 'sessions' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold mb-4">Active Games</h2>
              {games.length === 0 ? <p className="text-gray-500">No active sessions.</p> : (
                <div className="flex gap-4">
                  <div className="w-1/2 space-y-2">
                    {games.map(g => (
                      <div key={g.id} className={`p-4 border ${selectedGame === g.id ? 'border-purple-500 bg-purple-500/10' : 'border-white/10 bg-white/5'} rounded cursor-pointer hover:bg-white/10`} onClick={() => setSelectedGame(g.id)}>
                        <div className="font-bold text-lg">{g.gameCode || g.id} [{g.status}]</div>
                        <div className="text-xs text-gray-400">Host: {g.hostId}</div>
                        <div className="mt-4">
                          <button onClick={(e) => { e.stopPropagation(); killSession(g.id); }} className="bg-red-500/20 text-red-400 px-3 py-1 rounded border border-red-500/50 text-xs font-bold mr-2 hover:bg-red-500 hover:text-white">Kill Session</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {selectedGame && (
                    <div className="w-1/2 bg-white/5 border border-white/10 rounded p-4">
                      <h3 className="font-bold mb-4 text-purple-400 uppercase tracking-widest text-xs">Players in Session {selectedGame}</h3>
                      <div className="space-y-2">
                        {gamePlayers.map(p => (
                          <div key={p.id} className="flex items-center justify-between bg-black/50 p-2 rounded border border-white/5">
                            <span className={p.isBanned ? 'text-red-400 line-through' : 'text-white'}>{p.id}</span>
                            <div className="flex gap-2">
                              {!p.isBanned ? (
                                <button onClick={() => banPlayer(p.id)} className="px-2 py-1 bg-red-500/20 text-red-400 rounded text-xs font-bold hover:bg-red-500 hover:text-white">BAN</button>
                              ) : (
                                <button onClick={() => unbanPlayer(p.id)} className="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs font-bold hover:bg-green-500 hover:text-white">UNBAN</button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {activeTab === 'requests' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold">Game Mode Suggestions ({requests.length})</h2>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    await updateDoc(doc(db, 'settings', 'voting'), { activeOptions: [] });
                    toast.success("Weekly Vote Ended!");
                  }} className="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-4 py-2 font-bold rounded flex items-center gap-2 text-xs uppercase tracking-widest border border-red-500/50">
                    <X className="w-4 h-4" /> End Weekly Vote Now
                  </button>
                  <button onClick={generateWeekly4} className="bg-purple-500 hover:bg-purple-400 text-black px-4 py-2 font-bold rounded flex items-center gap-2">
                    <Zap className="w-4 h-4" /> AI Pick Weekly 4
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {requests.map(r => (
                  <div key={r.id} className="bg-white/5 border border-white/10 p-2 rounded text-xs">
                    {r.text}
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'feedback' && (
            <div className="space-y-4">
               <h2 className="text-xl font-bold">Real-time Feedback</h2>
               <p className="text-gray-400">Emails are also routed to supersauce2.0@hotmail.com.</p>
               <div className="space-y-2">
                 {feedback.map(f => (
                   <div key={f.id} className="bg-white/5 border border-white/10 p-4 rounded text-sm text-gray-200">
                     <span className="text-purple-400 font-bold block mb-1">[{f.createdAt?.toDate ? f.createdAt.toDate().toLocaleString() : 'Just now'}] {f.nickname || 'Unknown'}</span>
                     {f.text}
                   </div>
                 ))}
               </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
