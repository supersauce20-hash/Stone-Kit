import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { db } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { RefreshCw, UserX, UserCheck, Plus, Sparkles } from 'lucide-react';

export default function TutorialOverlay({ uid, onComplete }: { uid: string, onComplete: () => void }) {
  const [step, setStep] = useState(1);
  const [testBanned, setTestBanned] = useState(false);
  const [hasTestedBan, setHasTestedBan] = useState(false);
  const [hasTestedUnban, setHasTestedUnban] = useState(false);

  const finishTutorial = async () => {
    try {
      await updateDoc(doc(db, 'users', uid), { hasCompletedTutorial: true });
      onComplete();
    } catch (e) {
      console.error(e);
      onComplete(); // proceed anyway
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex justify-center items-center p-6">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 50 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="max-w-xl w-full bg-[#1A1D24] border border-white/10 rounded-[3rem] p-10 space-y-8 shadow-[0_0_100px_rgba(16,185,129,0.15)] flex flex-col"
      >
        <div className="flex justify-between items-center">
          <div className="flex flex-col">
            <span className="text-accent-emerald font-black uppercase tracking-widest text-[10px]">StoneKit Academy</span>
            <h2 className="text-3xl font-black text-white leading-tight">Step {step} of 3</h2>
          </div>
          <Button variant="ghost" onClick={finishTutorial} className="text-white/40 hover:text-white font-bold uppercase tracking-widest text-[10px]">Skip</Button>
        </div>

        <div className="flex-1 min-h-[250px] flex flex-col justify-center gap-6">
          <AnimatePresence mode="wait">
            {step === 1 && (
              <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 text-center">
                <div className="w-20 h-20 bg-accent-rose/10 rounded-full mx-auto flex items-center justify-center">
                  <RefreshCw className="w-10 h-10 text-accent-rose animate-spin-slow" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase text-white mb-2">The Golden Rule</h3>
                  <p className="text-white/60">If a student complains that their screen corresponds to the wrong question, or it freezes... <strong className="text-accent-rose">TELL THEM TO HIT REFRESH.</strong></p>
                  <p className="text-white/60 mt-4 text-sm">StoneKit is heavily reliant on real-time sync. Refreshing fixes 99% of visual glitches.</p>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 text-center">
                <div className="w-20 h-20 bg-yellow-500/10 rounded-full mx-auto flex items-center justify-center">
                  <UserX className="w-10 h-10 text-yellow-500" />
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase text-white mb-2">The Glitch Guard</h3>
                  <p className="text-white/60">If a student somehow buys negative items, or complains their stats are wrong due to a race condition, use the <strong className="text-yellow-400">BAN + UNBAN reset technique</strong>.</p>
                  <p className="text-white/60 mt-4 text-sm">This forces the student into a "time out", completely resets cache variables, and forces them back cleanly.</p>
                </div>
                
                <div className="flex bg-black/40 p-4 rounded-2xl gap-4 items-center justify-center border border-white/5">
                  <Button 
                    onClick={() => { setTestBanned(true); setHasTestedBan(true); }} 
                    disabled={testBanned}
                    className="bg-red-500 hover:bg-red-400 font-bold"
                  >
                    Test Ban
                  </Button>
                  <Button 
                    onClick={() => { setTestBanned(false); setHasTestedUnban(true); }}
                    disabled={!testBanned}
                    className="bg-white text-black hover:bg-gray-200 font-bold"
                  >
                    Test Unban
                  </Button>
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6 text-center">
                <div className="flex justify-center gap-4">
                  <div className="w-20 h-20 bg-accent-emerald/10 rounded-full flex items-center justify-center">
                    <Sparkles className="w-10 h-10 text-accent-emerald" />
                  </div>
                  <div className="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center">
                    <Plus className="w-10 h-10 text-blue-500" />
                  </div>
                </div>
                <div>
                  <h3 className="text-2xl font-black uppercase text-white mb-2">Game Creation</h3>
                  <p className="text-white/60">You can create kits two ways: 1) <strong className="text-accent-emerald">AI ARCHITECT</strong> will literally invent a game based on a topic prompt. 2) <strong className="text-blue-400">MANUAL</strong> where you build questions physically.</p>
                  <p className="text-white/60 mt-4 text-sm">All kits are backed up instantly to your dashboard. You can delete them later, and even share them to the community gallery.</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex gap-4">
          {step > 1 && (
            <Button onClick={() => setStep(step - 1)} className="flex-1 bg-white/5 hover:bg-white/10 h-14 font-bold rounded-2xl text-white">Back</Button>
          )}
          <Button 
            disabled={step === 2 && !(hasTestedBan && hasTestedUnban)}
            onClick={() => {
              if (step === 3) finishTutorial();
              else setStep(step + 1);
            }} 
            className="flex-2 w-full bg-accent-emerald hover:bg-accent-emerald/90 h-14 font-bold rounded-2xl text-white flex gap-2 disabled:bg-white/10 disabled:text-white/30"
          >
            {step === 3 ? 'FINISH' : step === 2 && !(hasTestedBan && hasTestedUnban) ? 'TRY BAN/UNBAN TO PROCEED' : 'NEXT STEP'}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
