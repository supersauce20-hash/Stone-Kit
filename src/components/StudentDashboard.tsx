import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { UserProfile } from '../types';

const FACES = ['🤠', '😎', '🧐', '🤖', '🐱', '🦊', '🚀', '👽'];

interface Props {
  user: User;
  profile: UserProfile;
}

export default function StudentDashboard({ user, profile }: Props) {
  const navigate = useNavigate();
  const [face, setFace] = useState(profile.chosenFace || '🤠');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile.chosenFace) {
      setFace(profile.chosenFace);
    }
  }, [profile.chosenFace]);

  const saveProfile = async () => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', user.uid), {
        chosenFace: face
      });
      toast.success('Avatar saved!');
    } catch (error: any) {
      toast.error('Error saving profile: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleJoin = () => {
    // Already implemented logic relying on the component routing
    navigate('/join');
  };

  return (
    <div className="p-8 pb-0 max-w-6xl mx-auto space-y-12">
      {(profile.role === 'student' || profile.role === 'dual' || profile.role === 'owner') && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Join Live Game */}
          <div className="bg-card-join p-10 rounded-[32px] flex flex-col justify-center items-start shadow-xl relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-48 h-48 border-[40px] border-white/10 rounded-full" />
            <h2 className="text-3xl font-black mb-4 relative z-10 text-white">Join Live Game</h2>
            <p className="text-white/80 mb-8 relative z-10">
              Have a game code from your teacher? Jump right in!
            </p>
            <Button 
              onClick={handleJoin}
              className="w-full h-16 text-xl font-bold bg-white text-card-join hover:bg-white/90 rounded-xl relative z-10 shadow-[0_10px_20px_rgba(244,63,94,0.4)]"
            >
              JOIN NOW
            </Button>
          </div>

          {/* Customization */}
          <div className="bg-card-host border border-white/10 p-10 rounded-[32px] space-y-8 shadow-xl relative overflow-hidden">
             <div className="absolute -bottom-8 -left-8 w-36 h-36 border-[30px] border-white/10 rotate-15 pointer-events-none" />
            <h2 className="text-2xl font-black text-white relative z-10">Customize Character</h2>
            
            <div className="space-y-4 relative z-10">
              <Label className="text-xs font-bold uppercase tracking-widest text-text-dim">Player Name: {profile.firstName}</Label>
              <p className="text-sm text-white/50">Your first name is used to identify you in game.</p>
            </div>

            <div className="space-y-4 relative z-10">
              <Label className="text-xs font-bold uppercase tracking-widest text-text-dim">Choose an Avatar</Label>
              <div className="flex gap-2 flex-wrap">
                {FACES.map(f => (
                  <button
                    key={f}
                    onClick={() => setFace(f)}
                    className={`w-14 h-14 text-3xl rounded-xl transition-all ${face === f ? 'bg-accent-emerald shadow-lg scale-110' : 'bg-white/5 hover:bg-white/10'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <Button 
              onClick={saveProfile} 
              disabled={isSaving}
              className="w-full h-14 font-bold bg-accent-emerald hover:bg-accent-emerald/90 text-white rounded-xl relative z-10"
            >
              {isSaving ? 'SAVING...' : 'SAVE AVATAR'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
