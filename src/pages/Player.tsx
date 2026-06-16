import React, { useState, useEffect, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { doc, onSnapshot, setDoc, updateDoc, increment, serverTimestamp, getDoc, collection, query, orderBy, limit, getDocs, runTransaction } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { Game, Player, Kit, Question } from '../types';
import { ShoppingBag, Zap, Shield, Trophy, X, TrendingUp, DollarSign, LogOut, Volume2, VolumeX } from 'lucide-react';
import { playSound, getMuted, setMuted } from '../lib/audio';

export default function PlayerPage() {
  const { code } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  let nickname = searchParams.get('nickname');
  let face = searchParams.get('face') || '🤠';
  
  if (!nickname) {
    const storedSession = sessionStorage.getItem('stonekit_session');
    if (storedSession) {
      const parsed = JSON.parse(storedSession);
      if (parsed.code === code && parsed.nickname) {
        nickname = parsed.nickname;
      }
    }
  }

  const [game, setGame] = useState<Game | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [player, setPlayer] = useState<Player | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [showShop, setShowShop] = useState(false);
  const [loading, setLoading] = useState(true);
  const [finalRank, setFinalRank] = useState<number | null>(null);
  
  // Voting State
  const [suggestion, setSuggestion] = useState('');
  const [activeOptions, setActiveOptions] = useState<any[]>([]);
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'voting'), (doc) => {
      if (doc.exists()) {
        setActiveOptions(doc.data().activeOptions || []);
      }
    });
    return unsub;
  }, []);

  // Easter Egg / Troll Trap State
  const [cheatKeys, setCheatKeys] = useState('');
  const [isCheating, setIsCheating] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const rickAudioRef = useRef<HTMLAudioElement | null>(null);
  
  // Study-Hard System
  const [wrongAnswerOverlay, setWrongAnswerOverlay] = useState<{ correctAnswer: string } | null>(null);
  const [overlayCountdown, setOverlayCountdown] = useState(0);

  useEffect(() => {
    if (overlayCountdown > 0) {
      const timer = setTimeout(() => setOverlayCountdown(prev => prev - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [overlayCountdown]);

  const [isMutedState, setIsMutedState] = useState(getMuted());

  const toggleMute = () => {
    const newMuted = !isMutedState;
    setMuted(newMuted);
    setIsMutedState(newMuted);
  };

  // Shop Prices
  const MULTIPLIER_PRICES = [0, 0, 100, 200, 2000, 20000, 200000, 2000000, 20000000, 200000000, 2000000000];
  const INSURANCE_PRICES = [0, 0, 10, 25, 100, 250, 100000, 1000000, 5000000, 25000000, 500000000];
  const MONEY_BASE_PRICES = [0, 0, 100, 500, 2000, 10000, 100000, 300000, 1000000, 10000000, 100000000];
  const MONEY_BASE_VALUES = [0, 1, 4, 10, 50, 200, 1000, 5000, 10000, 25000, 1000000];

  const currentMultiplierPrice = player ? MULTIPLIER_PRICES[Math.min(player.multiplier_lvl + 1, 10)] : 0;
  const currentInsurancePrice = player ? INSURANCE_PRICES[Math.min(player.insurance_lvl + 1, 10)] : 0;
  const currentMoneyBasePrice = player ? MONEY_BASE_PRICES[Math.min(player.money_lvl + 1, 10)] : 0;

  useEffect(() => {
    if (!code || !nickname) {
      navigate('/');
      return;
    }

    // Check lockout on start
    const storedLockout = sessionStorage.getItem('stonekit_lockout');
    if (storedLockout === 'banned') {
      setIsLockedOut(true);
    }

    sessionStorage.setItem('stonekit_session', JSON.stringify({ code, nickname }));

    const gameRef = doc(db, 'games', code);
    const unsubscribeGame = onSnapshot(gameRef, async (docSnap) => {
      if (docSnap.exists()) {
        const gameData = docSnap.data() as Game;
        setGame(gameData);
        
        // Fetch Kit if not already fetched
        if (!kit && gameData.kitId) {
          const kitSnap = await getDoc(doc(db, 'kits', gameData.kitId));
          if (kitSnap.exists()) {
            setKit(kitSnap.data() as Kit);
          }
        }

        if (gameData.status === 'finished') {
          calculateFinalRank();
        }
        setLoading(false);
      } else {
        toast.error('Game session ended.');
        sessionStorage.removeItem('stonekit_session');
        navigate('/');
      }
    });

    const playerRef = doc(db, `games/${code}/players`, nickname);
    const unsubscribePlayer = onSnapshot(playerRef, (docSnap) => {
      if (docSnap.exists()) {
        const pData = docSnap.data() as Player;
        setPlayer(pData);
        
        // Lockout / Mercy Sync (Removes stale closure dependencies)
        if (pData.isBanned) {
          sessionStorage.setItem('stonekit_lockout', 'banned');
          setIsLockedOut(true);
        } else {
          if (sessionStorage.getItem('stonekit_lockout') === 'banned') {
            toast.success('The Host showed you mercy (or your time is up). Welcome back!', { duration: 5000 });
          }
          sessionStorage.removeItem('stonekit_lockout');
          setIsLockedOut(false);
        }
      }
    });

    // Initial Registration
    setDoc(playerRef, {
      nickname,
      face,
      gameCode: code,
      score: 0,
      streak: 0,
      multiplier_lvl: 0,
      insurance_lvl: 0,
      money_lvl: 1,
      joinedAt: serverTimestamp()
    }, { merge: true });

    return () => {
      unsubscribeGame();
      unsubscribePlayer();
    };
  }, [code, nickname, navigate]);

  const calculateFinalRank = async () => {
    if (!code || !nickname) return;
    const playersRef = collection(db, `games/${code}/players`);
    const q = query(playersRef, orderBy('score', 'desc'));
    const snap = await getDocs(q);
    const index = snap.docs.findIndex(doc => doc.id === nickname);
    setFinalRank(index + 1);
  };

  // Keyboard Listener for Cheat
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (game?.status !== 'active' || isLockedOut) return;
      
      setCheatKeys(prev => {
        const newKeys = (prev + e.key).slice(-5);
        if (newKeys.toLowerCase() === 'cheat' && !isCheating) {
          
          // The 25% Gamble
          const roll = Math.floor(Math.random() * 100) + 1; // 1-100
          
          if (roll <= 25) {
            // BUSTED INSTANTLY
            playSound('busted');
            toast.error('BUSTED!', { icon: '🚨' });
            setIsLockedOut(true);
            sessionStorage.setItem('stonekit_lockout', 'banned');
            
            if (code && nickname) {
              const lockoutTime = Date.now() + 3600000; // 1 hour from now
              const playerRef = doc(db, `games/${code}/players`, nickname);
              updateDoc(playerRef, { isBanned: true, lockoutTimestamp: lockoutTime });
              const gameRef = doc(db, 'games', code);
              updateDoc(gameRef, { bustedPlayer: nickname });
            }
          } else {
            // SAFE - Auto-Pilot Mode
            setIsCheating(true);
            toast.success('AUTO-PILOT ACTIVATED', { icon: '😈' });
            
            // Max out stats
            if (code && nickname) {
              const playerRef = doc(db, `games/${code}/players`, nickname);
              updateDoc(playerRef, { multiplier_lvl: 10, insurance_lvl: 10, money_lvl: 10 });
            }
          }
        } else if (newKeys.toLowerCase() === 'dream' && code) {
          const gameRef = doc(db, 'games', code);
          updateDoc(gameRef, { dreamweaver: true });
        } else if (newKeys.toLowerCase().endsWith('rick') && code && nickname) {
          const gameRef = doc(db, 'games', code);
          updateDoc(gameRef, { rickRollSilencer: nickname });
        }
        return newKeys;
      });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [game?.status, isLockedOut, isCheating, code, nickname]);

  // Cheat Loop (Auto-Pilot)
  useEffect(() => {
    if (!isCheating || !game || !kit || !player || game.status !== 'active' || isLockedOut) return;

    const interval = setInterval(() => {
      // Auto-answer correctly
      const question = kit.questions[currentQuestionIndex];
      handleAnswer(question.correctIndex);
    }, 800);

    return () => clearInterval(interval);
  }, [isCheating, game, kit, player, currentQuestionIndex, isLockedOut, code, nickname]);

  // Countdown Timer for Lockout
  useEffect(() => {
    if (isLockedOut) {
      const interval = setInterval(() => {
        // If snapshot hasn't arrived, assume 1 hr
        const targetStamp = player?.lockoutTimestamp || Date.now() + 3600000;
        const remaining = targetStamp - Date.now();
        if (remaining <= 0) {
          setIsLockedOut(false);
          sessionStorage.removeItem('stonekit_lockout');
          if (code && nickname && player?.lockoutTimestamp) {
            const playerRef = doc(db, `games/${code}/players`, nickname);
            updateDoc(playerRef, { isBanned: false, lockoutTimestamp: null });
          }
        } else {
          setLockoutRemaining(Math.ceil(remaining / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [isLockedOut, player?.lockoutTimestamp, code, nickname]);

  // Rick Roll Silencer Sync
  useEffect(() => {
    if (game?.rickRollSilencer && game.rickRollSilencer !== nickname) {
      if (!rickAudioRef.current) {
        // Reliable IA direct mp3
        rickAudioRef.current = new Audio('https://ia801602.us.archive.org/11/items/NeverGonnaGiveYouUp/Rick%20Astley%20-%20Never%20Gonna%20Give%20You%20Up.mp3');
        rickAudioRef.current.loop = true;
      }
      rickAudioRef.current.play().catch(e => console.warn('Rickroll autoplay failed:', e));
    } else {
      if (rickAudioRef.current) {
        rickAudioRef.current.pause();
      }
    }

    return () => {
      if (rickAudioRef.current) {
        rickAudioRef.current.pause();
      }
    };
  }, [game?.rickRollSilencer, nickname]);

  // Game Timer Sync
  const [gameTimeLeft, setGameTimeLeft] = useState<number | null>(null);

  useEffect(() => {
    if (game?.status === 'active' && game.endTime) {
      const interval = setInterval(() => {
        const remaining = game.endTime! - Date.now();
        if (remaining <= 0) {
          setGameTimeLeft(0);
        } else {
          setGameTimeLeft(Math.ceil(remaining / 1000));
        }
      }, 1000);
      return () => clearInterval(interval);
    } else {
      setGameTimeLeft(null);
    }
  }, [game?.status, game?.endTime]);

  const handleAnswer = async (answerIndex: number) => {
    if (!game || !kit || !player || game.status !== 'active') return;

    const storedSession = sessionStorage.getItem('stonekit_session');
    const sessionData = storedSession ? JSON.parse(storedSession) : null;
    const currentNickname = sessionData?.nickname || nickname;
    const currentCode = sessionData?.code || code;

    if (!currentNickname || !currentCode) {
      toast.error("Player session lost. Please rejoin.");
      navigate('/');
      return;
    }

    const question = kit.questions[currentQuestionIndex];
    const isCorrect = answerIndex === question.correctIndex;

    const playerRef = doc(db, `games/${currentCode}/players`, currentNickname);
    const gameRef = doc(db, 'games', currentCode);

    try {
      await runTransaction(db, async (transaction) => {
        // 1. ALL READS FIRST
        const playerDoc = await transaction.get(playerRef);
        const gameDoc = await transaction.get(gameRef);

        if (!playerDoc.exists()) throw new Error("Player not found");
        
        const data = playerDoc.data();
        const currentScore = data.score || 0;
        const currentStreak = data.streak || 0;
        const currentHighestStreak = data.highestStreak || 0;
        const currentMultiplierLvl = data.multiplier_lvl || 0;
        const currentInsuranceLvl = data.insurance_lvl || 0;
        const currentMoneyLvl = data.money_lvl || 1; // Default is level 1

        let scoreChange = 0;
        let newStreak = currentStreak;
        let newHighestStreak = currentHighestStreak;

        if (isCorrect) {
          const startingCash = MONEY_BASE_VALUES[Math.min(currentMoneyLvl, 10)];
          const baseReward = startingCash + currentStreak;
          const actualMultiplier = Math.max(1, currentMultiplierLvl);
          scoreChange = baseReward * actualMultiplier;
          newStreak += 1;
          if (newStreak > newHighestStreak) newHighestStreak = newStreak;
        } else {
          const startingCash = MONEY_BASE_VALUES[Math.min(currentMoneyLvl, 10)];
          const penalty = startingCash;
          scoreChange = -Math.min(currentScore, penalty);
          newStreak = 0;
        }

        // 3. ALL WRITES AFTER READS
        transaction.update(playerRef, {
          score: currentScore + scoreChange,
          streak: newStreak,
          highestStreak: newHighestStreak
        });

        if (gameDoc.exists()) {
          if (isCorrect) {
            transaction.update(gameRef, {
              totalCorrectAnswers: increment(1),
              totalWealth: increment(scoreChange)
            });
          } else {
            transaction.update(gameRef, {
              totalWealth: increment(scoreChange)
            });
          }
        }
      });

      if (isCorrect) {
        playSound('correct');
        toast.success(`Correct!`, { icon: '💰' });
        setCurrentQuestionIndex((prev) => (prev + 1) % kit.questions.length);
      } else {
        playSound('incorrect');
        setWrongAnswerOverlay({ correctAnswer: question.answers[question.correctIndex] });
        setOverlayCountdown(3);
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const buyMultiplier = async () => {
    if (!player) return;

    const storedSession = sessionStorage.getItem('stonekit_session');
    const sessionData = storedSession ? JSON.parse(storedSession) : null;
    const currentNickname = sessionData?.nickname || nickname;
    const currentCode = sessionData?.code || code;

    if (!currentNickname || !currentCode) {
      toast.error("Player session lost.");
      return;
    }

    const playerRef = doc(db, `games/${currentCode}/players`, currentNickname);
    
    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        if (!playerDoc.exists()) throw new Error("Player not found");
        
        const currentScore = playerDoc.data().score || 0;
        const currentMultiplierLvl = playerDoc.data().multiplier_lvl || 0;
        
        if (currentMultiplierLvl >= 10) {
          throw new Error("Multiplier Maxed Out!");
        }

        const price = MULTIPLIER_PRICES[currentMultiplierLvl + 1];
        
        if (currentScore < price) {
          throw new Error("Not enough cash!");
        }
        
        transaction.update(playerRef, {
          score: currentScore - price,
          multiplier_lvl: currentMultiplierLvl + 1
        });
      });
      playSound('purchase');
      toast.success('Multiplier Upgraded!', { icon: '⚡' });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const buyInsurance = async () => {
    if (!player) return;

    const storedSession = sessionStorage.getItem('stonekit_session');
    const sessionData = storedSession ? JSON.parse(storedSession) : null;
    const currentNickname = sessionData?.nickname || nickname;
    const currentCode = sessionData?.code || code;

    if (!currentNickname || !currentCode) {
      toast.error("Player session lost.");
      return;
    }

    const playerRef = doc(db, `games/${currentCode}/players`, currentNickname);
    
    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        if (!playerDoc.exists()) throw new Error("Player not found");
        
        const currentScore = playerDoc.data().score || 0;
        const currentInsuranceLvl = playerDoc.data().insurance_lvl || 0;
        
        if (currentInsuranceLvl >= 10) {
          throw new Error("Insurance Maxed Out!");
        }

        const price = INSURANCE_PRICES[currentInsuranceLvl + 1];
        
        if (currentScore < price) {
          throw new Error("Not enough cash!");
        }
        
        transaction.update(playerRef, {
          score: currentScore - price,
          insurance_lvl: currentInsuranceLvl + 1
        });
      });
      playSound('purchase');
      toast.success('Insurance Upgraded!', { icon: '🛡️' });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const buyMoneyBase = async () => {
    if (!player) return;

    const storedSession = sessionStorage.getItem('stonekit_session');
    const sessionData = storedSession ? JSON.parse(storedSession) : null;
    const currentNickname = sessionData?.nickname || nickname;
    const currentCode = sessionData?.code || code;

    if (!currentNickname || !currentCode) {
      toast.error("Player session lost.");
      return;
    }

    const playerRef = doc(db, `games/${currentCode}/players`, currentNickname);
    
    try {
      await runTransaction(db, async (transaction) => {
        const playerDoc = await transaction.get(playerRef);
        if (!playerDoc.exists()) throw new Error("Player not found");
        
        const currentScore = playerDoc.data().score || 0;
        const currentMoneyLvl = playerDoc.data().money_lvl || 1;
        
        if (currentMoneyLvl >= 10) {
          throw new Error("Money Base Maxed Out!");
        }

        const price = MONEY_BASE_PRICES[currentMoneyLvl + 1];
        
        if (currentScore < price) {
          throw new Error("Not enough cash!");
        }
        
        transaction.update(playerRef, {
          score: currentScore - price,
          money_lvl: currentMoneyLvl + 1
        });
      });
      playSound('purchase');
      toast.success('Money Base Upgraded!', { icon: '💵' });
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-rose border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isLockedOut) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-red-900/20 animate-pulse" />
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-black border border-red-500/50 p-12 rounded-[3rem] text-center space-y-8 shadow-[0_0_100px_rgba(220,38,38,0.3)] relative z-10"
        >
          <div className="p-6 bg-red-500/20 rounded-3xl inline-block border border-red-500/50">
            <Shield className="w-16 h-16 text-red-500" />
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black uppercase tracking-tight text-red-500">LOCKED OUT</h1>
            <p className="text-red-400/80 font-bold">Anti-Cheat System Triggered</p>
          </div>
          <p className="text-sm text-red-500/80 uppercase tracking-widest font-bold">
            Your trial period of being a 'Pro Gamer' has expired. Wait out your sentence, or beg the host for mercy.
          </p>
          {lockoutRemaining > 0 && (
            <div className="text-4xl font-black text-white p-4 bg-red-500/10 rounded-2xl border border-red-500/20">
              {Math.floor(lockoutRemaining / 60)}:{(lockoutRemaining % 60).toString().padStart(2, '0')}
            </div>
          )}
        </motion.div>
      </div>
    );
  }

  if (game?.status === 'finished') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-card-host border border-white/10 p-12 rounded-[3rem] text-center space-y-8 shadow-2xl"
        >
          <div className="p-6 bg-accent-rose rounded-3xl inline-block">
            <Trophy className="w-16 h-16 text-white" />
          </div>
          <div className="space-y-4">
            <h1 className="text-5xl font-black uppercase tracking-tight">Game Over</h1>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 p-4 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Final Rank</span>
                <div className="text-2xl font-black text-white">#{finalRank || '?'}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Total Cash</span>
                <div className="text-2xl font-black text-accent-emerald">${player?.score.toLocaleString()}</div>
              </div>
              <div className="bg-white/5 p-4 rounded-2xl col-span-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Highest Streak</span>
                <div className="text-2xl font-black text-accent-rose italic">x{player?.highestStreak || 0}</div>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <Button 
              onClick={() => {
                sessionStorage.removeItem('stonekit_session');
                navigate('/');
              }} 
              className="w-full h-16 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10"
            >
              RETURN TO LOBBY
            </Button>
            
            <div className="pt-4 border-t border-white/10 space-y-2">
              <h3 className="font-bold uppercase tracking-widest text-emerald-400 text-sm">Tell us what you think</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Your feedback..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 font-bold text-white focus:outline-none focus:border-emerald-500"
                  id="feedbackInput"
                  onKeyDown={async (e) => {
                    const target = e.target as HTMLInputElement;
                    if (e.key === 'Enter' && target.value.trim().length > 2) {
                      try {
                        await setDoc(doc(collection(db, 'feedback')), { text: target.value, nickname, createdAt: serverTimestamp() });
                        target.value = '';
                        toast.success('✅ Success! Sent to StoneKit.', { style: { background: '#10B981', color: '#fff', border: 'none' } });
                      } catch(err) {}
                    }
                  }}
                />
                <Button 
                  onClick={async () => {
                    const target = document.getElementById('feedbackInput') as HTMLInputElement;
                    if (target && target.value.trim().length > 2) {
                      try {
                        await setDoc(doc(collection(db, 'feedback')), { text: target.value, nickname, createdAt: serverTimestamp() });
                        target.value = '';
                        toast.success('✅ Success! Sent to StoneKit.', { style: { background: '#10B981', color: '#fff', border: 'none' } });
                      } catch(err) {}
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl"
                >
                  SEND
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (game?.status === 'lobby') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-6 relative">
        <Button 
          onClick={() => {
            sessionStorage.removeItem('stonekit_session');
            navigate('/');
          }}
          variant="ghost"
          className="absolute top-8 left-8 text-text-dim hover:text-white"
        >
          <LogOut className="w-5 h-5 mr-2" /> Leave Game
        </Button>
        <div className="max-w-md w-full space-y-4">
          <div className="bg-card-join p-10 rounded-[3rem] text-center space-y-8 shadow-2xl relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-40 h-40 border-[30px] border-white/5 rounded-full" />
            <div className="space-y-4 relative z-10">
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto animate-bounce">
                <div className="w-10 h-10 bg-white rounded-full" />
              </div>
              <h1 className="text-4xl font-black uppercase tracking-tight">Lobby</h1>
              <p className="text-white/70 text-lg">Waiting for host to start the session...</p>
              <div className="p-4 bg-black/20 rounded-2xl font-bold">
                Playing as: <span className="text-white">{nickname}</span>
              </div>
            </div>
          </div>

          <div className="bg-black/30 p-6 rounded-3xl border border-white/5 space-y-6">
            <div className="space-y-3">
              <h3 className="font-bold uppercase tracking-widest text-text-dim text-xs">Want a new Game Mode?</h3>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                  placeholder="Suggest a mode..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 font-bold text-white focus:outline-none focus:border-purple-500"
                />
                <Button 
                  onClick={async () => {
                    if (suggestion.length > 2) {
                      await setDoc(doc(collection(db, 'game_requests')), { text: suggestion, createdAt: serverTimestamp() });
                      toast.success("Submitted to the Host!");
                      setSuggestion('');
                    }
                  }}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl"
                >
                  SEND
                </Button>
              </div>
            </div>

            {activeOptions.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-white/10">
                <h3 className="font-bold uppercase tracking-widest text-purple-400 text-sm">🗳️ VOTE: The Weekly 4</h3>
                <div className="space-y-2">
                  {activeOptions.map((opt, i) => {
                    const totalVotes = activeOptions.reduce((acc, curr) => acc + (curr.votes || 0), 0);
                    const pct = totalVotes === 0 ? 0 : Math.round((opt.votes / totalVotes) * 100);
                    return (
                      <button 
                        key={i}
                        disabled={hasVoted}
                        onClick={async () => {
                          setHasVoted(true);
                          const newOpts = [...activeOptions];
                          newOpts[i].votes = (newOpts[i].votes || 0) + 1;
                          await updateDoc(doc(db, 'settings', 'voting'), { activeOptions: newOpts });
                          toast.success("Vote locked in!");
                        }}
                        className={`w-full relative overflow-hidden p-3 rounded-xl border text-left flex justify-between items-center transition-all ${hasVoted ? 'border-white/10' : 'border-purple-500/30 hover:border-purple-400 cursor-pointer bg-white/5'}`}
                      >
                        <div 
                          className="absolute left-0 top-0 bottom-0 bg-purple-500/20 transition-all duration-500" 
                          style={{ width: `${pct}%` }} 
                        />
                        <span className="relative z-10 font-bold text-sm text-white/90">{opt.text}</span>
                        <span className="relative z-10 font-black text-purple-300 text-xs">{pct}%</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = kit?.questions[currentQuestionIndex];

  return (
    <div className="min-h-screen bg-bg text-white flex flex-col font-sans">
      {/* HUD */}
      <header className="p-6 grid grid-cols-3 items-center bg-card-host/50 backdrop-blur-md border-b border-white/5 sticky top-0 z-20">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Streak</span>
          <span className="text-2xl font-black text-accent-rose italic">x{player?.streak}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Balance</span>
          <span className="text-3xl font-black text-accent-emerald tracking-tighter flex items-center gap-2">
            ${player?.score.toLocaleString()}
            {gameTimeLeft !== null && (
              <span className="text-sm border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 rounded ml-2 text-emerald-400">
                {Math.floor(gameTimeLeft / 60)}:{(gameTimeLeft % 60).toString().padStart(2, '0')}
              </span>
            )}
          </span>
        </div>
        <div className="flex justify-end gap-2">
          <Button 
            onClick={toggleMute}
            variant="ghost"
            size="icon"
            className="text-text-dim hover:text-white"
            title={isMutedState ? "Unmute" : "Mute"}
          >
            {isMutedState ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </Button>
          <Button 
            onClick={() => {
              sessionStorage.removeItem('stonekit_session');
              navigate('/');
            }}
            variant="ghost"
            size="icon"
            className="text-text-dim hover:text-white"
            title="Leave Game"
          >
            <LogOut className="w-5 h-5" />
          </Button>
          <Button 
            onClick={() => setShowShop(true)}
            className="bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl h-12 px-4 flex gap-2 font-bold"
          >
            <ShoppingBag className="w-5 h-5 text-accent-rose" />
            SHOP
          </Button>
        </div>
      </header>

      {/* Study-Hard Overlay */}
      <AnimatePresence>
        {wrongAnswerOverlay && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            className="fixed inset-0 z-[60] bg-red-950/90 backdrop-blur-md p-6 flex flex-col items-center justify-center"
          >
            <div className="max-w-lg w-full bg-red-900/50 border-4 border-red-500 rounded-[3rem] p-10 space-y-8 text-center shadow-[0_0_100px_rgba(239,68,68,0.4)]">
              <h2 className="text-4xl font-black uppercase tracking-tight text-white animate-pulse">Incorrect</h2>
              <div className="space-y-2">
                <p className="text-red-200 font-bold uppercase tracking-widest text-sm">The Correct Answer Is:</p>
                <div className="bg-white text-black p-6 rounded-2xl font-black text-2xl shadow-xl">
                  {wrongAnswerOverlay.correctAnswer}
                </div>
              </div>
              
              <Button 
                disabled={overlayCountdown > 0}
                onClick={() => {
                  setWrongAnswerOverlay(null);
                  setCurrentQuestionIndex((prev) => (prev + 1) % kit!.questions.length);
                }}
                className={`w-full h-16 text-xl font-bold rounded-2xl transition-all ${overlayCountdown > 0 ? 'bg-red-800 text-red-400 opacity-50 cursor-not-allowed' : 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/50'}`}
              >
                {overlayCountdown > 0 ? `STUDY THIS (${overlayCountdown}s)` : 'CONTINUE'}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Work Area */}
      <main className="flex-1 p-6 flex flex-col items-center justify-center max-w-2xl mx-auto w-full space-y-8">
        <AnimatePresence mode="wait">
          <motion.div 
            key={currentQuestionIndex}
            initial={{ x: 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -20, opacity: 0 }}
            className="w-full space-y-8"
          >
            <div className="bg-card-host border border-white/10 p-10 rounded-[2.5rem] shadow-2xl text-center">
              <span className="text-xs font-black uppercase tracking-widest text-white/20 mb-4 block">
                Question {currentQuestionIndex + 1}
              </span>
              <h2 className="text-3xl font-bold leading-tight">
                {currentQuestion?.text}
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 w-full">
              {currentQuestion?.answers.map((answer, i) => (
                <Button
                  key={i}
                  onClick={() => handleAnswer(i)}
                  className="h-20 text-xl font-bold bg-white/5 hover:bg-white/10 border-2 border-white/5 hover:border-white/20 rounded-2xl transition-all active:scale-[0.98]"
                >
                  {answer}
                </Button>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Shop Overlay */}
      <AnimatePresence>
        {showShop && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-xl p-6 flex items-center justify-center"
          >
            <div className="max-w-md w-full bg-card-host border border-white/10 rounded-[3rem] p-10 space-y-8 relative shadow-2xl">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowShop(false)}
                className="absolute top-6 right-6 text-text-dim hover:text-white"
              >
                <X className="w-6 h-6" />
              </Button>

              <div className="text-center space-y-2">
                <h2 className="text-3xl font-black uppercase tracking-tight">Upgrade Shop</h2>
                <p className="text-text-dim">Boost your earnings and protect your streak.</p>
              </div>

              <div className="space-y-4">
                {/* Multiplier */}
                <div className="bg-white/5 p-6 rounded-3xl flex items-center justify-between border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent-rose/20 rounded-2xl">
                      <Zap className="w-6 h-6 text-accent-rose" />
                    </div>
                    <div>
                      <h4 className="font-black uppercase text-sm">Multiplier</h4>
                      <p className="text-xs text-text-dim">Current: x{player?.multiplier_lvl}</p>
                    </div>
                  </div>
                  <Button 
                    onClick={buyMultiplier}
                    disabled={(player?.score || 0) < currentMultiplierPrice || (player?.multiplier_lvl || 0) >= 10}
                    className="bg-accent-rose hover:bg-accent-rose/90 text-white font-bold rounded-xl"
                  >
                    {(player?.multiplier_lvl || 0) >= 10 ? 'MAX LVL' : currentMultiplierPrice === 0 ? 'FREE ($0)' : `$${currentMultiplierPrice.toLocaleString()}`}
                  </Button>
                </div>

                {/* Money Base */}
                <div className="bg-white/5 p-6 rounded-3xl flex items-center justify-between border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-2xl">
                      <DollarSign className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                      <h4 className="font-black uppercase text-sm">Starting Cash</h4>
                      <p className="text-xs text-text-dim">Level: {(player?.money_lvl || 1)}/10</p>
                    </div>
                  </div>
                  <Button 
                    onClick={buyMoneyBase}
                    disabled={(player?.score || 0) < currentMoneyBasePrice || (player?.money_lvl || 0) >= 10}
                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold rounded-xl"
                  >
                    {(player?.money_lvl || 0) >= 10 ? 'MAX LVL' : currentMoneyBasePrice === 0 ? 'FREE ($0)' : `$${currentMoneyBasePrice.toLocaleString()}`}
                  </Button>
                </div>

                {/* Insurance */}
                <div className="bg-white/5 p-6 rounded-3xl flex items-center justify-between border border-white/5">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-accent-emerald/20 rounded-2xl">
                      <Shield className="w-6 h-6 text-accent-emerald" />
                    </div>
                    <div>
                      <h4 className="font-black uppercase text-sm">Insurance</h4>
                      <p className="text-xs text-text-dim">Level: {player?.insurance_lvl}/10</p>
                    </div>
                  </div>
                  <Button 
                    onClick={buyInsurance}
                    disabled={(player?.score || 0) < currentInsurancePrice || (player?.insurance_lvl || 0) >= 10}
                    className="bg-accent-emerald hover:bg-accent-emerald/90 text-white font-bold rounded-xl"
                  >
                    {(player?.insurance_lvl || 0) >= 10 ? 'MAX LVL' : currentInsurancePrice === 0 ? 'FREE ($0)' : `$${currentInsurancePrice.toLocaleString()}`}
                  </Button>
                </div>
              </div>

              <div className="pt-4 text-center">
                <span className="text-text-dim text-sm font-bold uppercase tracking-widest">Your Balance</span>
                <div className="text-3xl font-black text-accent-emerald">${player?.score.toLocaleString()}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer Stats */}
      <footer className="p-6 flex justify-center gap-6 text-text-dim text-[10px] font-black uppercase tracking-[0.2em] flex-wrap">
        <div className="flex items-center gap-2">
          <DollarSign className="w-3 h-3" />
          Base Lvl {player?.money_lvl || 1}
        </div>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3 h-3" />
          Multiplier x{player?.multiplier_lvl}
        </div>
        <div className="flex items-center gap-2">
          <Shield className="w-3 h-3" />
          Insurance Lvl {player?.insurance_lvl}
        </div>
      </footer>
    </div>
  );
}
