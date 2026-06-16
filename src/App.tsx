/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import React, { Suspense, useState, useEffect } from 'react';
import Landing from './pages/Landing';
import Join from './pages/Join';
import Host from './pages/Host';
import Player from './pages/Player';
import { Toaster } from 'sonner';
import { auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

const StoneKitTerminal = React.lazy(() => import('./components/StoneKitTerminal'));

export default function App() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsAdmin(user?.email?.toLowerCase() === 'supersauce2.0@hotmail.com');
    });
    return unsub;
  }, []);

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/join" element={<Join />} />
        <Route path="/join/:code" element={<Join />} />
        <Route path="/host" element={<Host />} />
        <Route path="/player/:code" element={<Player />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster position="top-center" expand={true} richColors />
      <Suspense fallback={null}>
        {isAdmin && <StoneKitTerminal />}
      </Suspense>
      {!isAdmin && <CrashReporter />}
    </Router>
  );
}

function CrashReporter() {
  const [crashed, setCrashed] = useState<ErrorEvent | null>(null);

  useEffect(() => {
    const handler = (e: ErrorEvent) => setCrashed(e);
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  if (!crashed) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-red-900 border-2 border-red-500 rounded-[2rem] p-8 max-w-sm w-full text-center space-y-6 shadow-2xl">
        <h2 className="text-2xl font-black text-white">Something went wrong!</h2>
        <p className="text-red-200 text-sm">Report to Stone?</p>
        <div className="flex gap-4">
          <button 
            onClick={() => setCrashed(null)} 
            className="flex-1 py-3 font-bold bg-white/10 hover:bg-white/20 text-white rounded-xl"
          >
            NO
          </button>
          <button 
            onClick={() => {
              window.location.href = `mailto:supersauce2.0@hotmail.com?subject=StoneKit Crash Report&body=Error: ${crashed.message}%0A%0AStack: ${crashed.error?.stack || 'Unknown'}`;
              setCrashed(null);
            }} 
            className="flex-1 py-3 font-bold bg-red-500 hover:bg-red-400 text-white rounded-xl"
          >
            YES
          </button>
        </div>
      </div>
    </div>
  );
}
