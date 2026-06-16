import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');

  useEffect(() => {
    // Auto-rejoin handled solely during active routing to /player or /host.
    // Landing page stays clean so users can always choose their starting path.
  }, [navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 5) {
      toast.error('Please enter a valid 5-digit code');
      return;
    }

    try {
      const gameRef = doc(db, 'games', code);
      const gameSnap = await getDoc(gameRef);

      if (!gameSnap.exists()) {
        toast.error('Game session not found. Check your code!');
        return;
      }

      toast.success(`Session ${code} found!`);
      navigate(`/join/${code}`);
    } catch (error: any) {
      toast.error('Error finding game: ' + error.message);
    }
  };

  return (
    <div className="min-h-screen bg-bg flex flex-col overflow-hidden font-sans text-white">
      {/* Header */}
      <header className="py-10 px-15 flex items-center justify-center z-10">
        <div className="text-3xl font-extrabold tracking-tighter uppercase flex items-center gap-2.5">
          <div className="w-8 h-8 bg-accent-rose rounded-md transform rotate-45" />
          StoneKit
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-5 px-10 pb-10">
        {/* JOIN PATH */}
        <motion.section 
          initial={{ x: -50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="bg-card-join rounded-[32px] p-12 flex flex-col justify-center items-start relative overflow-hidden shadow-[0_20px_50px_rgba(99,102,241,0.3)]"
        >
          <div className="absolute -top-12 -right-12 w-48 h-48 border-[40px] border-white/10 rounded-full pointer-events-none" />
          
          <span className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-black/20 rounded-full mb-6">
            Player Entrance
          </span>
          <h2 className="text-5xl font-extrabold mb-4 leading-[1.1]">
            Join as Guest
          </h2>
          <p className="text-lg text-white/80 mb-8 leading-relaxed max-w-md">
            Jump straight into a live session with a room code. No account required.
          </p>
          
          <div className="w-full space-y-4 mb-6 relative z-10">
            <Button 
              onClick={() => navigate('/join')}
              className="w-full h-16 text-xl font-bold bg-accent-rose hover:bg-accent-rose/90 text-white rounded-xl shadow-[0_10px_20px_rgba(244,63,94,0.4)] transition-transform active:scale-95"
            >
              JOIN AS GUEST
            </Button>
          </div>
          
          <div className="text-xs text-white/40 flex items-center gap-1.5">
            <span>Anonymous access enabled</span>
          </div>
        </motion.section>

        {/* HOST PATH */}
        <motion.section 
          initial={{ x: 50, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6 }}
          className="bg-card-host rounded-[32px] p-15 flex flex-col justify-center items-start relative overflow-hidden border border-white/10"
        >
          <div className="absolute -bottom-8 -left-8 w-36 h-36 border-[30px] border-white/10 rotate-15 pointer-events-none" />
          
          <span className="text-xs font-bold uppercase tracking-widest px-3 py-1.5 bg-white/10 text-accent-emerald rounded-full mb-6">
            StoneKit Accounts
          </span>
          <h2 className="text-5xl font-extrabold mb-4 leading-[1.1]">
            Login / Sign Up
          </h2>
          <p className="text-lg text-white/80 mb-10 leading-relaxed max-w-md">
            Students can customize their profile. Teachers can create and host awesome sessions.
          </p>

          <div className="w-full space-y-3">
            <Button 
              onClick={() => navigate('/host?mode=login')}
              className="w-full h-14 text-lg font-bold bg-accent-emerald hover:bg-accent-emerald/90 text-white rounded-xl transition-transform active:scale-95"
            >
              LOGIN TO ACCOUNT
            </Button>
            <Button 
              variant="outline"
              onClick={() => navigate('/host?mode=signup')}
              className="w-full h-14 text-lg font-bold bg-transparent border-2 border-white/20 hover:bg-white/5 text-white rounded-xl transition-transform active:scale-95"
            >
              CREATE NEW ACCOUNT
            </Button>
          </div>

          <div className="mt-6 text-xs text-text-dim flex items-center gap-1.5">
            <span>Powered by Firebase Auth</span>
          </div>
        </motion.section>
      </main>
    </div>
  );
}
