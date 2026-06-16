import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, LogIn, UserPlus, Mail, X, Settings } from 'lucide-react';
import { auth, db } from '../firebase';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider,
  onAuthStateChanged,
  User
} from 'firebase/auth';
import { collection, setDoc, doc, updateDoc, serverTimestamp, query, where, getDocs, onSnapshot } from 'firebase/firestore';
import { toast } from 'sonner';
import KitGallery from '@/components/KitGallery';
import KitCreator from '@/components/KitCreator';
import HostDashboard from '@/components/HostDashboard';
import StudentDashboard from '@/components/StudentDashboard';
import SettingsDashboard from '@/components/SettingsDashboard';
import TutorialOverlay from '@/components/TutorialOverlay';
import { Kit, UserProfile, Role } from '../types';

export default function Host() {
  const [searchParams] = useSearchParams();
  const [isLogin, setIsLogin] = useState(searchParams.get('mode') !== 'signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);
  const [view, setView] = useState<'gallery' | 'creator' | 'game' | 'settings'>('gallery');
  const [editingKit, setEditingKit] = useState<Kit | undefined>(undefined);
  const [activeGameCode, setActiveGameCode] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [selectedKit, setSelectedKit] = useState<Kit | null>(null);
  const [gameSettings, setGameSettings] = useState({
    randomNicknames: false,
    minutes: 5,
    seconds: 0
  });
  const navigate = useNavigate();

  const [needsSetup, setNeedsSetup] = useState(false);
  const [setupFirstName, setSetupFirstName] = useState('');
  const [setupLastName, setSetupLastName] = useState('');
  
  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;
    
    const unsubscribeAuth = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        if (currentUser.displayName && !setupFirstName) {
           const parts = currentUser.displayName.split(' ');
           setSetupFirstName(parts[0]);
           if (parts.length > 1) {
             setSetupLastName(parts.slice(1).join(' '));
           }
        }
        
        // Start profile listener
        const userRef = doc(db, 'users', currentUser.uid);
        unsubscribeProfile = onSnapshot(userRef, async (docSnap) => {
          if (docSnap.exists()) {
            const profile = docSnap.data() as UserProfile;
            
            if (!profile.firstName || !profile.role) {
               setNeedsSetup(true);
               setUserProfile(null);
            } else {
               setNeedsSetup(false);
               setUserProfile(profile);
               
               if (profile.role === 'owner' || profile.role === 'dual') {
                 // Removed allGames view for developer console
               }
            }
            setCheckingRole(false);
          } else {
            if (currentUser.email === 'supersauce2.0@hotmail.com') {
              const ownerProfile = {
                uid: currentUser.uid,
                email: currentUser.email,
                role: 'owner' as Role,
                firstName: 'Super',
                lastName: 'Sauce',
                displayName: currentUser.displayName || 'Owner',
                createdAt: serverTimestamp()
              };
              try {
                await setDoc(userRef, ownerProfile, { merge: true });
              } catch (e: any) {
                console.error("Auto-setup failed: ", e);
                toast.error("Auto-setup failed: " + e.message);
              }
            } else {
              setNeedsSetup(true);
              setUserProfile(null);
            }
            setCheckingRole(false);
          }
        });

        // Check for active game to reconnect (for host)
        const savedView = sessionStorage.getItem('activeView');
        const gamesRef = collection(db, 'games');
        const q = query(gamesRef, where('hostId', '==', currentUser.uid), where('status', 'in', ['lobby', 'active']));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const activeGame = querySnapshot.docs[0].data();
          if (savedView === 'host' || sessionStorage.getItem('stonekit_host_session') === activeGame.gameCode) {
            setActiveGameCode(activeGame.gameCode);
            setView('game');
            toast.info(`Reconnected to active session: ${activeGame.gameCode}`);
          }
        }
      } else {
        setCheckingRole(false);
        setUserProfile(null);
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = undefined;
        }
      }
    });
    return () => {
      unsubscribeAuth();
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const selectRole = async (role: Role) => {
    if (!user) return;
    if (!setupFirstName.trim()) {
      toast.error('First name is required');
      return;
    }
    setCheckingRole(true);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        email: user.email,
        role,
        firstName: setupFirstName.trim(),
        lastName: setupLastName.trim(),
        displayName: `${setupFirstName.trim()} ${setupLastName.trim()}`.trim(),
        createdAt: serverTimestamp()
      }, { merge: true });
      toast.success(`Welcome to StoneKit as a ${role}!`);
    } catch (error: any) {
      toast.error('Error setting role: ' + error.message);
      setCheckingRole(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        toast.success('Logged in successfully!');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        toast.success('Account created successfully!');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      toast.success('Signed in with Google!');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleHostGame = async () => {
    if (!user || !selectedKit) return;
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const totalSeconds = (gameSettings.minutes * 60) + gameSettings.seconds;
    
    try {
      await setDoc(doc(db, 'games', code), {
        gameCode: code,
        hostId: user.uid,
        kitId: selectedKit.id,
        status: 'lobby',
        settings: {
          randomNicknames: gameSettings.randomNicknames,
          timer: totalSeconds
        },
        totalWealth: 0,
        totalCorrectAnswers: 0,
        createdAt: serverTimestamp()
      });
      sessionStorage.setItem('activeView', 'host');
      sessionStorage.setItem('stonekit_host_session', code);
      setActiveGameCode(code);
      setView('game');
      setShowSettings(false);
      toast.success(`Game ${code} created!`);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const killSession = async (gameCode: string) => {
    try {
      await updateDoc(doc(db, 'games', gameCode), {
        status: 'finished'
      });
      toast.success(`Session ${gameCode} killed.`);
    } catch (e: any) {
      toast.error('Failed to kill session: ' + e.message);
    }
  };

  if (activeGameCode && view === 'game') {
    return <HostDashboard gameCode={activeGameCode} onBack={() => { setView('gallery'); setActiveGameCode(null); }} />;
  }

  if (user) {
    if (checkingRole) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-accent-rose border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
    
    if (needsSetup || !userProfile) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-6 text-white text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl w-full bg-card-host p-12 rounded-[32px] space-y-12 border border-white/10"
          >
            <div className="space-y-4">
              <h1 className="text-5xl font-black uppercase tracking-tight">Setup Your Profile</h1>
              <p className="text-xl text-text-dim text-left">Please enter your details and pick your role.</p>
            </div>
            
            <div className="grid grid-cols-2 gap-4 text-left">
              <div className="space-y-2">
                <Label htmlFor="firstName" className="text-xs font-bold uppercase text-white/50">First Name</Label>
                <Input 
                  id="firstName"
                  value={setupFirstName}
                  onChange={(e) => setSetupFirstName(e.target.value)}
                  placeholder="e.g. John"
                  className="bg-white/5 border-white/10 text-white font-bold h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lastName" className="text-xs font-bold uppercase text-white/50">Last Name</Label>
                <Input 
                  id="lastName"
                  value={setupLastName}
                  onChange={(e) => setSetupLastName(e.target.value)}
                  placeholder="e.g. Doe"
                  className="bg-white/5 border-white/10 text-white font-bold h-12"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Button 
                onClick={() => selectRole('student')}
                className="h-32 text-xl font-black bg-white/5 hover:bg-white/10 border-2 border-transparent hover:border-white transition-all rounded-2xl flex flex-col items-center justify-center gap-2 text-white"
              >
                <span className="text-3xl">🎒</span>
                STUDENT
                <span className="text-[10px] font-normal opacity-50 uppercase tracking-widest mt-1">Play Games</span>
              </Button>
              <Button 
                onClick={() => selectRole('teacher')}
                className="h-32 text-xl font-black bg-white/5 hover:bg-white/10 border-2 border-transparent hover:border-white transition-all rounded-2xl flex flex-col items-center justify-center gap-2 text-white"
              >
                <span className="text-3xl">🧑‍🏫</span>
                TEACHER
                <span className="text-[10px] font-normal opacity-50 uppercase tracking-widest mt-1">Host Games</span>
              </Button>
              <Button 
                onClick={() => selectRole('dual')}
                className="h-32 text-xl font-black bg-white/5 hover:bg-accent-emerald/20 border-2 border-transparent hover:border-accent-emerald transition-all rounded-2xl flex flex-col items-center justify-center gap-2 text-white"
              >
                <span className="text-3xl">⚔️</span>
                DUAL
                <span className="text-[10px] font-normal opacity-50 text-accent-emerald uppercase tracking-widest mt-1">Both Features</span>
              </Button>
            </div>
          </motion.div>
        </div>
      );
    }
    
    return (
      <div className="min-h-screen bg-bg text-white">
        {userProfile.hasCompletedTutorial !== true && (
          <TutorialOverlay uid={user.uid} onComplete={() => setUserProfile({ ...userProfile, hasCompletedTutorial: true })} />
        )}
        <AnimatePresence mode="wait">
          {view === 'gallery' ? (
            <motion.div 
              key="gallery"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="p-8 pb-0 flex justify-end items-center gap-4">
                <Button variant="ghost" onClick={() => setView('settings')} className="text-text-dim hover:text-white">
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
                <Button variant="ghost" onClick={() => auth.signOut()} className="text-text-dim hover:text-white">
                  Sign Out ({user.email})
                </Button>
              </div>
              
              <StudentDashboard user={user} profile={userProfile} />
              
              <KitGallery 
                onCreateNew={() => { setEditingKit(undefined); setView('creator'); }}
                onEdit={(kit) => { setEditingKit(kit); setView('creator'); }}
                onHost={(kit) => { setSelectedKit(kit); setShowSettings(true); }}
              />

              {/* Pre-Flight Settings Modal */}
              <AnimatePresence>
                {showSettings && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-xl flex items-center justify-center p-6"
                  >
                    <motion.div 
                      initial={{ scale: 0.9, y: 20 }}
                      animate={{ scale: 1, y: 0 }}
                      className="max-w-md w-full bg-card-host border border-white/10 p-10 rounded-[3rem] space-y-8 shadow-2xl"
                    >
                      <div className="text-center space-y-2">
                        <h2 className="text-3xl font-black uppercase tracking-tight">Pre-Flight Setup</h2>
                        <p className="text-text-dim">Configure your session for {selectedKit?.title}</p>
                      </div>

                      <div className="space-y-6">
                        <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                          <div className="space-y-1">
                            <Label className="font-bold text-white">Random Nicknames</Label>
                            <p className="text-xs text-text-dim">Assign funny names automatically</p>
                          </div>
                          <button 
                            onClick={() => setGameSettings(prev => ({ ...prev, randomNicknames: !prev.randomNicknames }))}
                            className={`w-12 h-6 rounded-full transition-colors relative ${gameSettings.randomNicknames ? 'bg-accent-emerald' : 'bg-white/10'}`}
                          >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${gameSettings.randomNicknames ? 'left-7' : 'left-1'}`} />
                          </button>
                        </div>

                        <div className="space-y-3">
                          <Label className="text-xs uppercase font-bold tracking-widest text-text-dim ml-1">Game Duration</Label>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <Input 
                                type="number" 
                                value={gameSettings.minutes} 
                                onChange={(e) => setGameSettings(prev => ({ ...prev, minutes: parseInt(e.target.value) || 0 }))}
                                className="h-14 bg-white/5 border-transparent focus:border-white text-center font-bold text-xl rounded-xl"
                              />
                              <span className="text-[10px] uppercase font-black text-text-dim block text-center">Minutes</span>
                            </div>
                            <div className="space-y-1">
                              <Input 
                                type="number" 
                                value={gameSettings.seconds} 
                                onChange={(e) => setGameSettings(prev => ({ ...prev, seconds: parseInt(e.target.value) || 0 }))}
                                className="h-14 bg-white/5 border-transparent focus:border-white text-center font-bold text-xl rounded-xl"
                              />
                              <span className="text-[10px] uppercase font-black text-text-dim block text-center">Seconds</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-4 pt-4">
                        <Button variant="ghost" onClick={() => setShowSettings(false)} className="flex-1 h-14 font-bold rounded-xl">
                          CANCEL
                        </Button>
                        <Button onClick={handleHostGame} className="flex-1 h-14 bg-accent-rose hover:bg-accent-rose/90 text-white font-bold rounded-xl shadow-lg">
                          CONFIRM & HOST
                        </Button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ) : view === 'creator' ? (
            <motion.div 
              key="creator"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <KitCreator 
                initialKit={editingKit}
                onBack={() => { setView('gallery'); setEditingKit(undefined); }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="settings"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <SettingsDashboard 
                user={user} 
                profile={userProfile} 
                onBack={() => setView('gallery')} 
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <motion.button
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        onClick={() => navigate('/')}
        className="absolute top-8 left-8 text-text-dim hover:text-white flex items-center gap-2 transition-colors z-20"
      >
        <ArrowLeft className="w-5 h-5" />
        Back to Home
      </motion.button>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-w-md w-full relative z-10"
      >
        <div className="bg-card-host border border-white/10 p-10 rounded-[2.5rem] shadow-2xl">
          <div className="flex flex-col items-center text-center space-y-8">
            <div className="flex gap-4 p-1 bg-white/5 rounded-2xl w-full">
              <button
                onClick={() => setIsLogin(true)}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${isLogin ? 'bg-white/10 text-white shadow-sm' : 'text-text-dim'}`}
              >
                Login
              </button>
              <button
                onClick={() => setIsLogin(false)}
                className={`flex-1 py-3 rounded-xl font-bold transition-all ${!isLogin ? 'bg-white/10 text-white shadow-sm' : 'text-text-dim'}`}
              >
                Sign Up
              </button>
            </div>

            <div className="space-y-2">
              <h1 className="text-4xl font-extrabold text-white tracking-tight uppercase">
                {isLogin ? 'Welcome Back' : 'Get Started'}
              </h1>
              <p className="text-white/60">
                {isLogin ? 'Access your dashboard to host games.' : 'Create a host account to start sessions.'}
              </p>
            </div>

            <form onSubmit={handleAuth} className="w-full space-y-5">
              <div className="space-y-2 text-left">
                <Label htmlFor="email" className="text-xs uppercase font-bold tracking-widest text-text-dim ml-1">
                  Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-dim" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="host@stonekit.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="h-14 pl-12 font-bold bg-white/5 border-2 border-transparent focus:border-white rounded-xl transition-all text-white placeholder:text-white/20"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 text-left">
                <Label htmlFor="password" title="Password must be at least 6 characters" className="text-xs uppercase font-bold tracking-widest text-text-dim ml-1">
                  Password
                </Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-14 font-bold bg-white/5 border-2 border-transparent focus:border-white rounded-xl transition-all text-white placeholder:text-white/20"
                  required
                />
              </div>

              <Button 
                type="submit"
                disabled={loading}
                className="w-full h-16 text-xl font-bold bg-accent-emerald hover:bg-accent-emerald/90 text-white rounded-2xl flex gap-2 transition-transform active:scale-95"
              >
                {loading ? 'Processing...' : (isLogin ? <><LogIn className="w-6 h-6" /> LOGIN</> : <><UserPlus className="w-6 h-6" /> CREATE ACCOUNT</>)}
              </Button>
            </form>

            <div className="relative w-full py-4">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/5"></div>
              </div>
              <div className="relative flex justify-center text-xs uppercase font-bold">
                <span className="bg-card-host px-4 text-text-dim">Or continue with</span>
              </div>
            </div>

            <Button 
              variant="outline" 
              onClick={handleGoogleSignIn}
              className="w-full h-14 font-bold border-2 border-white/10 bg-transparent hover:bg-white/5 text-white rounded-xl flex gap-3 transition-transform active:scale-95"
            >
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
              Google Account
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
