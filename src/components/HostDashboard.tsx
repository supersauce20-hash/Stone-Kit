import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Users, Play, Settings, ArrowLeft, Trophy, TrendingUp, Timer, X, Crown, Star, BarChart3, Volume2, VolumeX } from 'lucide-react';
import { db } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, query, where, addDoc, serverTimestamp } from 'firebase/firestore';
import { Kit, Game, GameSettings } from '../types';
import { Line } from 'react-chartjs-2';
import confetti from 'canvas-confetti';
import { playSound, getMuted, setMuted } from '../lib/audio';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface HostDashboardProps {
  gameCode: string;
  onBack: () => void;
}

export default function HostDashboard({ gameCode, onBack }: HostDashboardProps) {
  const [game, setGame] = useState<Game | null>(null);
  const [players, setPlayers] = useState<any[]>([]);
  const [wealthHistory, setWealthHistory] = useState<number[]>([]);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [bustedAnnouncement, setBustedAnnouncement] = useState<string | null>(null);
  const [isMutedState, setIsMutedState] = useState(getMuted());
  const dreamAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const handleBeforeUnload = () => {
      updateDoc(doc(db, 'games', gameCode), { status: 'finished' }).catch(() => {});
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [gameCode]);

  useEffect(() => {
    if (game?.dreamweaver && !isMutedState) {
      if (!dreamAudioRef.current) {
        dreamAudioRef.current = new Audio('https://ia801602.us.archive.org/3/items/dream-weaver_202302/Dream%20Weaver.mp3');
        dreamAudioRef.current.loop = true;
      }
      dreamAudioRef.current.play().catch(e => console.warn('Dreamweaver autoplay failed:', e));
    } else {
      if (dreamAudioRef.current) {
        dreamAudioRef.current.pause();
      }
    }
    return () => {
      if (dreamAudioRef.current) {
        dreamAudioRef.current.pause();
      }
    }
  }, [game?.dreamweaver, isMutedState]);

  const toggleMute = () => {
    const newMuted = !isMutedState;
    setMuted(newMuted);
    setIsMutedState(newMuted);
  };

  useEffect(() => {
    if (game?.bustedPlayer) {
      playSound('busted');
      
      let announcementText = '';
      if (game.bustedPlayer.startsWith('Host has expelled')) {
        announcementText = game.bustedPlayer;
      } else {
        const roasts = [
          "⚠️ [NAME] just tried to cheat. Their skill issue is so big it's visible from space.",
          "⚠️ [NAME] thought they were a hacker. Turns out they're just a clown 🤡.",
          "⚠️ ALERT: [NAME] has a room-temperature IQ. They just activated the Troll Trap.",
          "⚠️ [NAME] is the reason the game needs instructions. Imagine cheating in a tycoon game.",
          "⚠️ STOP THE COUNT! [NAME] is using a steering wheel for a brain.",
          "⚠️ [NAME] tried to 'cheat' their way to 1st place. Now they're 1st place in the Ban Lobby."
        ];
        const randomRoast = roasts[Math.floor(Math.random() * roasts.length)];
        announcementText = randomRoast.replace('[NAME]', game.bustedPlayer);
      }
      
      setBustedAnnouncement(announcementText);
      const timer = setTimeout(() => {
        setBustedAnnouncement(null);
        // Clear it from DB so it can trigger again if they cheat again later
        updateDoc(doc(db, 'games', gameCode), { bustedPlayer: null });
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [game?.bustedPlayer, gameCode]);

  useEffect(() => {
    const gameRef = doc(db, 'games', gameCode);
    const unsubscribeGame = onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        const data = doc.data() as Game;
        setGame(data);
        if (data.totalWealth !== undefined) {
          setWealthHistory(prev => {
            if (prev.length === 0 || prev[prev.length - 1] !== data.totalWealth) {
              return [...prev, data.totalWealth].slice(-20);
            }
            return prev;
          });
        }
        
        if (data.status === 'finished') {
          playSound('victory');
          confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#F43F5E', '#10B981', '#6366F1']
          });
        }
      }
    });

    const playersQuery = query(collection(db, `games/${gameCode}/players`));
    const unsubscribePlayers = onSnapshot(playersQuery, (snapshot) => {
      setPlayers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    return () => {
      unsubscribeGame();
      unsubscribePlayers();
    };
  }, [gameCode]);

  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (game?.status === 'active' && game.endTime) {
      const interval = setInterval(() => {
        const remaining = game.endTime! - Date.now();
        if (remaining <= 0) {
          clearInterval(interval);
          setTimeLeft(0);
          endGame();
        } else {
          setTimeLeft(Math.ceil(remaining / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setTimeLeft(null);
    }
  }, [game?.status, game?.endTime]);

  const startGame = async () => {
    if (!game) return;
    const durationMs = game.settings.timer * 1000;
    await updateDoc(doc(db, 'games', gameCode), { 
      status: 'active',
      endTime: Date.now() + durationMs
    });
  };

  const endGame = async () => {
    if (!game) return;
    const sortedPlayers = [...players].sort((a, b) => b.score - a.score);
    const winner = sortedPlayers[0];
    
    await updateDoc(doc(db, 'games', gameCode), { 
      status: 'finished',
      winnerNickname: winner?.nickname || 'None'
    });

    // Save to History
    await addDoc(collection(db, 'history'), {
      gameCode,
      hostId: game.hostId,
      kitId: game.kitId,
      winnerNickname: winner?.nickname || 'None',
      totalWealth: game.totalWealth,
      totalCorrectAnswers: game.totalCorrectAnswers,
      playerCount: players.length,
      endedAt: serverTimestamp()
    });
    setShowEndConfirm(false);
  };

  const unblockPlayer = async (playerId: string) => {
    await updateDoc(doc(db, `games/${gameCode}/players`, playerId), {
      isBanned: false,
      lockoutTimestamp: null
    });
  };

  const kickPlayer = async (playerId: string, nickname: string) => {
    await updateDoc(doc(db, `games/${gameCode}/players`, playerId), {
      isBanned: true
    });
    // Trigger announcement
    await updateDoc(doc(db, 'games', gameCode), { 
      bustedPlayer: `Host has expelled ${nickname} from the session.` 
    });
  };

  const toggleSetting = async (key: keyof GameSettings) => {
    if (!game) return;
    const newSettings = { ...game.settings, [key]: !game.settings[key] };
    await updateDoc(doc(db, 'games', gameCode), { settings: newSettings });
  };

  const chartData = {
    labels: wealthHistory.map((_, i) => i),
    datasets: [
      {
        label: 'Total World Wealth',
        data: wealthHistory,
        borderColor: '#10B981',
        backgroundColor: 'rgba(16, 185, 129, 0.1)',
        fill: true,
        tension: 0.4,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { display: false },
      y: { 
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#94A3B8' }
      },
    },
  };

  const formatWealth = (value: number) => {
    if (value >= 1_000_000_000_000) {
      return (value / 1_000_000_000_000).toFixed(1) + 'T';
    }
    if (value >= 1_000_000_000) {
      return (value / 1_000_000_000).toFixed(1) + 'B';
    }
    return value.toLocaleString();
  };

  if (!game) return null;

  if (game.status === 'finished') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const top3 = sorted.slice(0, 3);

    return (
      <div className="min-h-screen bg-bg p-8 flex flex-col items-center justify-center space-y-12">
        <motion.div 
          initial={{ y: -50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="text-center space-y-4"
        >
          <h1 className="text-7xl font-black uppercase tracking-tighter text-white italic">Victory Podium</h1>
          <p className="text-text-dim text-xl font-bold uppercase tracking-widest">The session has concluded</p>
        </motion.div>

        <div className="flex items-end justify-center gap-4 md:gap-8 h-80 w-full max-w-4xl">
          {/* 2nd Place */}
          {top3[1] && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: '60%' }}
              className="flex-1 bg-card-host border-t-4 border-slate-400 rounded-t-3xl flex flex-col items-center justify-end p-6 relative"
            >
              <div className="absolute -top-16 flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-400 rounded-full flex items-center justify-center font-black text-xl mb-2">2</div>
                <span className="font-bold text-white text-lg">{top3[1].nickname}</span>
              </div>
              <span className="font-black text-slate-400 text-2xl">${formatWealth(top3[1].score)}</span>
            </motion.div>
          )}

          {/* 1st Place */}
          {top3[0] && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: '90%' }}
              className="flex-1 bg-accent-rose border-t-4 border-yellow-400 rounded-t-3xl flex flex-col items-center justify-end p-6 relative shadow-[0_0_50px_rgba(244,63,94,0.3)]"
            >
              <div className="absolute -top-24 flex flex-col items-center">
                <Crown className="w-16 h-16 text-yellow-400 mb-2 drop-shadow-lg" />
                <span className="font-black text-white text-2xl uppercase tracking-tight">{top3[0].nickname}</span>
              </div>
              <span className="font-black text-white text-3xl mb-4">${formatWealth(top3[0].score)}</span>
            </motion.div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <motion.div 
              initial={{ height: 0 }}
              animate={{ height: '40%' }}
              className="flex-1 bg-card-host border-t-4 border-amber-700 rounded-t-3xl flex flex-col items-center justify-end p-6 relative"
            >
              <div className="absolute -top-16 flex flex-col items-center">
                <div className="w-12 h-12 bg-amber-700 rounded-full flex items-center justify-center font-black text-xl mb-2">3</div>
                <span className="font-bold text-white text-lg">{top3[2].nickname}</span>
              </div>
              <span className="font-black text-amber-700 text-2xl">${formatWealth(top3[2].score)}</span>
            </motion.div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
          <div className="bg-card-host p-8 rounded-[2.5rem] border border-white/10 flex items-center gap-6">
            <div className="p-4 bg-accent-emerald/20 rounded-2xl">
              <TrendingUp className="w-8 h-8 text-accent-emerald" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-text-dim">Final World Wealth</span>
              <div className="text-3xl font-black text-white">${formatWealth(game.totalWealth)}</div>
            </div>
          </div>
          <div className="bg-card-host p-8 rounded-[2.5rem] border border-white/10 flex items-center gap-6">
            <div className="p-4 bg-accent-rose/20 rounded-2xl">
              <Star className="w-8 h-8 text-accent-rose" />
            </div>
            <div>
              <span className="text-xs font-black uppercase tracking-widest text-text-dim">Correct Answers</span>
              <div className="text-3xl font-black text-white">{game.totalCorrectAnswers}</div>
            </div>
          </div>
        </div>

        <Button onClick={() => {
          sessionStorage.removeItem('stonekit_session');
          onBack();
        }} className="h-16 px-12 bg-white/5 hover:bg-white/10 text-white font-black rounded-2xl border border-white/10">
          CLOSE ROOM & RETURN TO DASHBOARD
        </Button>
      </div>
    );
  }

  return (
    <div className={`min-h-screen bg-bg p-8 space-y-8 ${(bustedAnnouncement && !bustedAnnouncement.includes('Host has expelled')) ? 'animate-shake' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => {
            sessionStorage.removeItem('stonekit_session');
            onBack();
          }} className="text-text-dim hover:text-white">
            <ArrowLeft className="w-5 h-5 mr-2" /> Close Room
          </Button>
          <Button 
            variant="ghost" 
            size="icon"
            onClick={toggleMute}
            className="text-text-dim hover:text-white"
            title={isMutedState ? "Unmute" : "Mute"}
          >
            {isMutedState ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-6 py-3 bg-card-host border border-white/10 rounded-2xl flex items-center gap-3">
            <Users className="w-5 h-5 text-accent-rose" />
            <span className="font-bold text-xl">{players.length} Players</span>
          </div>
          {game.status === 'lobby' ? (
            <Button onClick={startGame} className="bg-accent-emerald hover:bg-accent-emerald/90 text-white font-black px-8 h-14 rounded-2xl shadow-lg">
              <Play className="w-6 h-6 mr-2" /> START GAME
            </Button>
          ) : game.status === 'active' ? (
            <Button onClick={() => setShowEndConfirm(true)} className="bg-accent-rose hover:bg-accent-rose/90 text-white font-black px-8 h-14 rounded-2xl shadow-lg">
              <X className="w-6 h-6 mr-2" /> END GAME
            </Button>
          ) : null}
        </div>
      </div>

      <AnimatePresence>
        {bustedAnnouncement && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.5, y: -500 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 1.5 }}
            transition={{ type: "spring", bounce: 0.6, duration: 1 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/80 backdrop-blur-md pointer-events-none"
          >
            <div className="text-center space-y-4 p-12 bg-black border-4 border-red-500 rounded-[3rem] shadow-[0_0_100px_rgba(220,38,38,0.8)]">
              <h1 className="text-7xl font-black text-red-500 uppercase tracking-tighter animate-pulse">BUSTED!</h1>
              <p className="text-4xl font-bold text-white uppercase tracking-widest">
                {bustedAnnouncement}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showEndConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-xl flex items-center justify-center p-6"
          >
            <div className="max-w-md w-full bg-card-host border border-white/10 p-10 rounded-[3rem] text-center space-y-8 shadow-2xl">
              <div className="p-6 bg-accent-rose/20 rounded-full inline-block">
                <X className="w-12 h-12 text-accent-rose" />
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tight">End Game?</h2>
                <p className="text-text-dim text-lg">This will conclude the session for all players and crown a winner.</p>
              </div>
              <div className="flex gap-4">
                <Button variant="ghost" onClick={() => setShowEndConfirm(false)} className="flex-1 h-14 font-bold rounded-xl">
                  CANCEL
                </Button>
                <Button onClick={endGame} className="flex-1 h-14 bg-accent-rose hover:bg-accent-rose/90 text-white font-bold rounded-xl shadow-lg">
                  END SESSION
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Visuals / Center Stage */}
        <div className="lg:col-span-3 space-y-8">
          {game.status === 'lobby' ? (
            <div className="space-y-8">
              <div className="bg-card-join p-10 rounded-[3rem] shadow-2xl relative overflow-hidden max-w-xl mx-auto text-center border border-white/10">
                <div className="absolute -top-10 -right-10 w-40 h-40 border-[30px] border-white/5 rounded-full" />
                <div className="relative z-10 space-y-4">
                  <span className="text-xl font-black uppercase tracking-widest text-white/50">Join Code</span>
                  <h1 className="text-9xl font-black tracking-[0.05em] text-white leading-none">{gameCode}</h1>
                </div>
              </div>

              <div className="bg-card-host border border-white/10 p-10 rounded-[3rem] h-full min-h-[500px] flex flex-col items-center justify-start text-center space-y-8 max-w-4xl mx-auto">
                {players.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center space-y-6 w-full">
                    <div className="p-8 bg-white/5 rounded-full animate-pulse">
                      <Users className="w-20 h-20 text-white/20" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-4xl font-black uppercase tracking-tight">Waiting for Players</h2>
                      <p className="text-text-dim text-lg">Tell your squad to join using the code above.</p>
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex-1 flex flex-col max-h-[600px]">
                    <div className="space-y-2 mb-8 flex-shrink-0">
                      <h2 className="text-4xl font-black uppercase tracking-tight">Lobby</h2>
                      <p className="text-text-dim text-lg">
                        Waiting for host to start... ({players.length} player{players.length !== 1 ? 's' : ''} joined)
                      </p>
                    </div>
                    <div className="w-full overflow-y-auto pr-2 space-y-3 custom-scrollbar flex-1">
                      {players.map((p, i) => (
                        <motion.div 
                          key={p.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.2, delay: Math.min(i * 0.05, 0.5) }}
                          className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 transition-colors border border-white/10 rounded-2xl"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-accent-rose/20 flex items-center justify-center text-accent-rose font-black">
                              {i + 1}
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-white/5 flex items-center justify-center text-2xl">
                              {p.face || '🤠'}
                            </div>
                            <span className="font-bold text-xl text-white">{p.nickname}</span>
                          </div>
                          <div className="flex items-center gap-3">
                            {/* Readiness status placeholder */}
                            <span className="px-4 py-1.5 bg-accent-emerald/20 text-accent-emerald font-bold rounded-xl text-sm uppercase tracking-wider flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-accent-emerald animate-pulse"></span>
                              Ready
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-8 h-full">
              <div className="text-center flex justify-center gap-6">
                <div className="inline-block bg-white/5 border border-white/10 px-8 py-3 rounded-full">
                  <span className="text-sm font-black uppercase tracking-widest text-white/50 mr-4">Join Code</span>
                  <span className="text-2xl font-black tracking-[0.1em] text-white">{gameCode}</span>
                </div>
                {timeLeft !== null && (
                  <div className="inline-block bg-white/5 border border-white/10 px-8 py-3 rounded-full flex items-center">
                    <Timer className="w-5 h-5 text-accent-emerald mr-3" />
                    <span className="text-2xl font-black tracking-[0.1em] text-white">
                      {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 h-full">
                <div className="bg-card-host border border-white/10 p-8 rounded-[3rem] space-y-6">
                <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                  <Trophy className="w-6 h-6 text-accent-rose" /> Leaderboard
                </h3>
                <div className="space-y-3">
                  {[...players].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 10).map((p, i) => (
                    <div key={p.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl">
                      <div className="flex items-center gap-4">
                        <span className="w-8 h-8 flex items-center justify-center bg-white/10 rounded-lg font-black text-sm">
                          {i + 1}
                        </span>
                        <span className="w-8 h-8 flex items-center justify-center bg-white/5 rounded-lg text-lg">
                          {p.face || '🤠'}
                        </span>
                        <span className="font-bold text-lg">{p.nickname}</span>
                        {p.isBanned && (
                          <span className="flex items-center gap-2 px-2 py-1 bg-red-500/20 text-red-500 text-[10px] font-black rounded-md uppercase tracking-widest">
                            <span className="text-xl font-black leading-none drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">L</span>
                            Banned
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-black text-accent-emerald">${formatWealth(p.score || 0)}</span>
                        {p.isBanned ? (
                          <Button 
                            onClick={() => unblockPlayer(p.id)}
                            size="sm"
                            className="bg-white hover:bg-gray-200 text-black font-bold h-8 px-3"
                          >
                            Unblock
                          </Button>
                        ) : (
                          <Button 
                            onClick={() => kickPlayer(p.id, p.nickname)}
                            size="sm"
                            variant="ghost"
                            className="text-red-500 hover:text-red-400 hover:bg-red-500/20 h-8 w-8 p-0"
                            title="Kick Player"
                          >
                            🚫
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-card-host border border-white/10 p-8 rounded-[3rem] space-y-6">
                <h3 className="text-2xl font-black uppercase tracking-tight flex items-center gap-3">
                  <TrendingUp className="w-6 h-6 text-accent-emerald" /> Total World Wealth
                </h3>
                <div className="h-64 w-full">
                  <Line data={chartData} options={chartOptions} />
                </div>
                <div className="text-center">
                  <span className="text-6xl font-black text-white tracking-tighter">
                    ${formatWealth(game.totalWealth)}
                  </span>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
