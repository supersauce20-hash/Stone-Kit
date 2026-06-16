import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, User, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { db, auth } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import type { User as FirebaseUser } from 'firebase/auth';
import { Game } from '../types';

const ADJECTIVES = ['Brave', 'Swift', 'Golden', 'Mighty', 'Calm', 'Bright', 'Noble', 'Clever', 'Happy', 'Wild', 'Fierce', 'Loyal', 'Quick', 'Bold', 'Sharp'];
const NOUNS = ['Stone', 'Kit', 'Falcon', 'Wolf', 'Lion', 'Eagle', 'Bear', 'Shark', 'Tiger', 'Dragon', 'Phoenix', 'Panther', 'Hawk', 'Raven', 'Cobra'];

export default function Join() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [inputCode, setInputCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [face, setFace] = useState('🤠');
  const [game, setGame] = useState<Game | null>(null);
  const [loading, setLoading] = useState(!!code);
  const [rerollsLeft, setRerollsLeft] = useState(5);
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [studentProfileReady, setStudentProfileReady] = useState(false);

  const generateRandomName = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj} ${noun}`.toUpperCase();
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setAuthUser(user);
      if (user) {
        try {
          const profileSnap = await getDoc(doc(db, 'users', user.uid));
          if (profileSnap.exists()) {
            const data = profileSnap.data();
            if (data.firstName) setNickname(data.firstName);
            if (data.chosenFace) setFace(data.chosenFace);
          }
        } catch (e) {
          console.error("Error fetching profile", e);
        }
      }
      setStudentProfileReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const fetchGame = async () => {
      if (!code) {
        setLoading(false);
        return;
      }
      
      // Auto-rejoin logic based entirely on stored session context to reconnect to the appropriate live game loop
      const storedSession = sessionStorage.getItem('stonekit_session');
      if (storedSession) {
        const parsed = JSON.parse(storedSession);
        if (parsed.code === code && parsed.nickname) {
          navigate(`/player/${code}?nickname=${encodeURIComponent(parsed.nickname)}&face=${encodeURIComponent(parsed.face || '🤠')}`);
          return;
        }
      }

      try {
        const gameSnap = await getDoc(doc(db, 'games', code));
        if (gameSnap.exists()) {
          const gameData = gameSnap.data() as Game;
          setGame(gameData);
          if (gameData.settings.randomNicknames) {
            setNickname(generateRandomName());
          }
        } else {
          toast.error('Session not found');
          sessionStorage.removeItem('stonekit_session');
          navigate('/');
        }
      } catch (error: any) {
        toast.error(error.message);
      } finally {
        setLoading(false);
      }
    };
    fetchGame();
  }, [code, navigate]);

  const handleReroll = () => {
    if (rerollsLeft > 0) {
      setNickname(generateRandomName());
      setRerollsLeft(prev => prev - 1);
    } else {
      toast.error('No rerolls left!');
    }
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      toast.error('Please enter a nickname');
      return;
    }
    
    toast.success(`Joining session ${code}...`);
    navigate(`/player/${code}?nickname=${encodeURIComponent(nickname)}&face=${encodeURIComponent(face)}`);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.length !== 5) {
      toast.error('Please enter a valid 5-digit code');
      return;
    }
    
    setLoading(true);
    try {
      const gameRef = doc(db, 'games', inputCode);
      const gameSnap = await getDoc(gameRef);

      if (!gameSnap.exists()) {
        toast.error('Game session not found. Check your code!');
        setLoading(false);
        return;
      }
      
      const gameData = gameSnap.data() as Game;
      if (!gameData.settings.randomNicknames && nickname.trim()) {
         // Auto-join if they already have a nickname defined!
         toast.success('Auto-joining with saved profile...');
         navigate(`/player/${inputCode}?nickname=${encodeURIComponent(nickname)}&face=${encodeURIComponent(face)}`);
      } else {
        navigate(`/join/${inputCode}`);
      }
    } catch (error: any) {
      toast.error('Error finding game: ' + error.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-accent-rose border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Pick Code View
  if (!code) {
    return (
      <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          onClick={() => navigate('/')}
          className="absolute top-8 left-8 text-text-dim hover:text-white flex items-center gap-2 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </motion.button>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-card-join p-12 rounded-[32px] shadow-2xl relative overflow-hidden"
        >
          <div className="absolute -top-12 -right-12 w-48 h-48 border-[40px] border-white/10 rounded-full" />
          
          <div className="relative z-10 space-y-8">
            <div className="space-y-4">
              <span className="text-xs font-bold uppercase tracking-widest px-3 py-1 bg-black/20 rounded-full">
                Step 1 of 2
              </span>
              <h1 className="text-4xl font-extrabold text-white leading-tight">
                Enter Room Code
              </h1>
            </div>

            <form onSubmit={handleCodeSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="inputCode" className="text-white/80 font-bold uppercase tracking-widest text-xs ml-1">
                  5-Digit Code
                </Label>
                <Input
                  id="inputCode"
                  type="text"
                  maxLength={5}
                  value={inputCode}
                  onChange={(e) => setInputCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  className="h-16 text-center text-3xl font-black tracking-[0.2em] bg-white/10 border-2 border-transparent focus:border-white rounded-xl transition-all text-white placeholder:text-white/20"
                  placeholder="00000"
                  autoFocus
                />
              </div>

              <Button 
                type="submit"
                className="w-full h-16 text-xl font-bold bg-white text-card-join hover:bg-gray-100 rounded-xl transition-transform active:scale-95"
              >
                FIND SESSION
              </Button>
            </form>
          </div>
        </motion.div>
      </div>
    );
  }

  // Pick Nickname View
  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4">
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/')}
        className="absolute top-8 left-8 text-text-dim hover:text-white flex items-center gap-2 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        Back
      </motion.button>

      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-card-join p-10 rounded-[2.5rem] shadow-2xl border border-white/10 relative overflow-hidden">
          <div className="absolute -top-10 -right-10 w-32 h-32 border-[20px] border-white/5 rounded-full pointer-events-none" />
          
          <div className="flex flex-col items-center text-center space-y-8 relative z-10">
            <div className="p-4 bg-white/10 rounded-2xl">
              <User className="w-12 h-12 text-white" />
            </div>
            
            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold text-white tracking-tight uppercase">Identity</h1>
              <p className="text-white/70">
                {game?.settings.randomNicknames 
                  ? 'The host has enabled random names.' 
                  : 'Pick a nickname to represent you in the arena.'}
              </p>
            </div>

            <form onSubmit={handleJoin} className="w-full space-y-6">
              <div className="space-y-2 text-left">
                <Label htmlFor="nickname" className="text-xs uppercase font-bold tracking-widest text-white/50 ml-1">
                  Your Nickname
                </Label>
                <div className="relative">
                  <Input
                    id="nickname"
                    type="text"
                    placeholder="PLAYER_ONE"
                    value={nickname}
                    readOnly={game?.settings.randomNicknames}
                    onChange={(e) => setNickname(e.target.value.toUpperCase())}
                    className={`h-16 text-center text-2xl font-black bg-white/10 border-2 border-transparent focus:border-white rounded-2xl transition-all text-white placeholder:text-white/20 ${game?.settings.randomNicknames ? 'cursor-default' : ''}`}
                  />
                  {game?.settings.randomNicknames && (
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2">
                      <span className="text-[10px] font-black text-white/30 uppercase">{rerollsLeft} REROLLS</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={handleReroll}
                        disabled={rerollsLeft === 0}
                        className="w-10 h-10 rounded-xl hover:bg-white/10 text-white"
                      >
                        <RefreshCw className={`w-5 h-5 ${rerollsLeft === 0 ? 'opacity-20' : ''}`} />
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Button 
                type="submit"
                className="w-full h-16 text-xl font-bold bg-accent-rose hover:bg-accent-rose/90 text-white rounded-2xl shadow-lg transition-transform active:scale-95"
              >
                READY TO PLAY
              </Button>
            </form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
