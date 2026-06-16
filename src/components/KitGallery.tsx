import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Button } from '@/components/ui/button';
import { Plus, Play, Edit3, Download, Trash2, Search, History, LayoutGrid, Calendar, Trophy as TrophyIcon, TrendingUp, Globe, Upload, Eye, X, Save } from 'lucide-react';
import { db, auth } from '../firebase';
import { getStorage, ref, deleteObject } from 'firebase/storage';
import { collection, query, where, onSnapshot, deleteDoc, doc, orderBy, updateDoc, addDoc, serverTimestamp, getDocs, limit } from 'firebase/firestore';
import { toast } from 'sonner';
import { Kit } from '../types';

interface KitGalleryProps {
  onCreateNew: () => void;
  onEdit: (kit: Kit) => void;
  onHost: (kit: Kit) => void;
}

export default function KitGallery({ onCreateNew, onEdit, onHost }: KitGalleryProps) {
  const [kits, setKits] = useState<Kit[]>([]);
  const [communityKits, setCommunityKits] = useState<Kit[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'kits' | 'community' | 'history'>('kits');
  const [viewingKit, setViewingKit] = useState<Kit | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;

    const kitsQuery = query(collection(db, 'kits'), where('ownerId', '==', auth.currentUser.uid));
    const unsubscribeKits = onSnapshot(kitsQuery, (snapshot) => {
      const kitsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit));
      setKits(kitsData);
      if (activeTab === 'kits') setLoading(false);
    });

    const historyQuery = query(
      collection(db, 'history'), 
      where('hostId', '==', auth.currentUser.uid),
      orderBy('endedAt', 'desc')
    );
    const unsubscribeHistory = onSnapshot(historyQuery, (snapshot) => {
      const historyData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(historyData);
      if (activeTab === 'history') setLoading(false);
    });

    const communityQuery = query(collection(db, 'kits'), where('isPublic', '==', true), limit(20));
    const unsubscribeCommunity = onSnapshot(communityQuery, (snapshot) => {
      const communityData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Kit));
      setCommunityKits(communityData);
      if (activeTab === 'community') setLoading(false);
    });

    return () => {
      unsubscribeKits();
      unsubscribeHistory();
      unsubscribeCommunity();
    };
  }, [activeTab]);

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (window.confirm('Are you sure you want to delete this kit?')) {
      try {
        await deleteDoc(doc(db, 'kits', id));
        // Storage is loosely coupled here, so wrap in a try-catch to avoid breaking UI 
        try {
          const storage = getStorage();
          const fileRef = ref(storage, `kits/${id}.json`);
          await deleteObject(fileRef);
        } catch (storageErr) {
          console.warn("Storage deletion skipped/failed", storageErr);
        }
        toast.success('Kit deleted completely.');
      } catch (error: any) {
        toast.error(error.message);
      }
    }
  };

  const handlePublish = async (kit: Kit) => {
    try {
      await updateDoc(doc(db, 'kits', kit.id!), { isPublic: !kit.isPublic });
      toast.success(kit.isPublic ? 'Unpublished from gallery' : 'Published to community gallery!');
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const kit = JSON.parse(event.target?.result as string) as Kit;
        if (kit.title && kit.questions) {
          setViewingKit(kit);
          toast.success('StoneKit loaded!');
        } else {
          toast.error('Invalid .stonekit file');
        }
      } catch (error) {
        toast.error('Failed to parse .stonekit file');
      }
    };
    reader.readAsText(file);
  };

  const downloadKit = (kit: Kit) => {
    const { id, ...rest } = kit;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(rest));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href",     dataStr);
    downloadAnchorNode.setAttribute("download", `${kit.title.replace(/\s+/g, '_')}.stonekit`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    toast.success('Backup downloaded!');
  };

  const saveToLibrary = async (kit: Kit) => {
    try {
      const { id, ...rest } = kit;
      await addDoc(collection(db, 'kits'), {
        ...rest,
        ownerId: auth.currentUser?.uid,
        isPublic: false,
        createdAt: serverTimestamp()
      });
      toast.success('Saved to your library!');
      setViewingKit(null);
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const filteredKits = activeTab === 'kits' 
    ? kits.filter(k => k.title.toLowerCase().includes(searchTerm.toLowerCase()))
    : communityKits.filter(k => k.title.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="max-w-6xl w-full mx-auto p-6 space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-4xl font-black uppercase tracking-tight">Creator Hub</h1>
          <p className="text-text-dim">Manage your game templates and review past sessions.</p>
        </div>
        <div className="flex gap-3">
          <div className="relative">
            <input 
              type="file" 
              accept=".stonekit" 
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <Button variant="outline" className="bg-transparent border-white/10 hover:bg-white/5 text-white font-bold h-14 px-6 rounded-2xl">
              <Upload className="w-5 h-5 mr-2" /> UPLOAD .STONEKIT
            </Button>
          </div>
          <Button onClick={onCreateNew} className="bg-accent-rose hover:bg-accent-rose/90 text-white font-bold h-14 px-8 rounded-2xl shadow-lg">
            <Plus className="w-6 h-6 mr-2" /> CREATE ONE
          </Button>
        </div>
      </div>

      <div className="flex gap-2 p-1.5 bg-card-host border border-white/10 rounded-2xl w-fit">
        <Button 
          variant={activeTab === 'kits' ? 'secondary' : 'ghost'}
          onClick={() => setActiveTab('kits')}
          className="rounded-xl font-bold"
        >
          <LayoutGrid className="w-4 h-4 mr-2" /> MY KITS
        </Button>
        <Button 
          variant={activeTab === 'community' ? 'secondary' : 'ghost'}
          onClick={() => setActiveTab('community')}
          className="rounded-xl font-bold"
        >
          <Globe className="w-4 h-4 mr-2" /> COMMUNITY
        </Button>
        <Button 
          variant={activeTab === 'history' ? 'secondary' : 'ghost'}
          onClick={() => setActiveTab('history')}
          className="rounded-xl font-bold"
        >
          <History className="w-4 h-4 mr-2" /> MATCH HISTORY
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'kits' || activeTab === 'community' ? (
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-text-dim w-5 h-5" />
              <input 
                type="text"
                placeholder={activeTab === 'kits' ? "Search your kits..." : "Search community kits..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-14 pl-12 bg-card-host border border-white/10 rounded-2xl focus:outline-none focus:border-white transition-colors"
              />
            </div>

            {loading ? (
              <div className="flex justify-center py-20">
                <div className="w-12 h-12 border-4 border-accent-rose border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredKits.length === 0 ? (
              <div className="text-center py-20 bg-card-host border border-dashed border-white/10 rounded-[3rem] space-y-4">
                <div className="p-6 bg-white/5 rounded-full inline-block">
                  {activeTab === 'kits' ? <Plus className="w-12 h-12 text-white/20" /> : <Globe className="w-12 h-12 text-white/20" />}
                </div>
                <p className="text-text-dim text-xl">
                  {activeTab === 'kits' ? "No kits found. Create your first one!" : "No community kits found yet."}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredKits.map((kit) => (
                  <motion.div 
                    key={kit.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-card-host border border-white/10 p-8 rounded-[2.5rem] flex flex-col space-y-6 group hover:border-white/30 transition-all"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex justify-between items-start">
                        <h3 className="text-2xl font-black uppercase tracking-tight group-hover:text-accent-rose transition-colors">{kit.title}</h3>
                        {kit.ownerId === auth.currentUser?.uid && (
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handlePublish(kit)}
                            className={kit.isPublic ? 'text-accent-emerald' : 'text-white/20'}
                            title={kit.isPublic ? 'Published' : 'Private'}
                          >
                            <Globe className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <p className="text-text-dim line-clamp-2">{kit.description || 'No description provided.'}</p>
                      <div className="text-[10px] font-bold uppercase tracking-widest text-white/20">
                        {kit.questions.length} Questions
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button onClick={() => onHost(kit)} className="bg-accent-emerald hover:bg-accent-emerald/90 text-white font-bold rounded-xl">
                        <Play className="w-4 h-4 mr-2" /> HOST
                      </Button>
                      {kit.ownerId === auth.currentUser?.uid ? (
                        <Button variant="outline" onClick={() => onEdit(kit)} className="bg-transparent border-white/10 hover:bg-white/5 text-white font-bold rounded-xl">
                          <Edit3 className="w-4 h-4 mr-2" /> EDIT
                        </Button>
                      ) : (
                        <Button variant="outline" onClick={() => saveToLibrary(kit)} className="bg-transparent border-white/10 hover:bg-white/5 text-white font-bold rounded-xl">
                          <Plus className="w-4 h-4 mr-2" /> SAVE
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => downloadKit(kit)} className="text-text-dim hover:text-white rounded-xl">
                        <Download className="w-4 h-4 mr-2" /> BACKUP
                      </Button>
                      {kit.ownerId === auth.currentUser?.uid && (
                        <Button variant="ghost" onClick={(e) => handleDelete(kit.id!, e)} className="text-text-dim hover:text-accent-rose rounded-xl">
                          <Trash2 className="w-4 h-4 mr-2" /> DELETE
                        </Button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div 
            key="history"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6"
          >
            {history.length === 0 ? (
              <div className="text-center py-20 bg-card-host border border-dashed border-white/10 rounded-[3rem] space-y-4">
                <div className="p-6 bg-white/5 rounded-full inline-block">
                  <History className="w-12 h-12 text-white/20" />
                </div>
                <p className="text-text-dim text-xl">No match history yet. Host a game to see stats!</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {history.map((match) => (
                  <motion.div 
                    key={match.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="bg-card-host border border-white/10 p-6 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-6"
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 bg-white/5 rounded-2xl flex items-center justify-center">
                        <Calendar className="w-8 h-8 text-accent-rose" />
                      </div>
                      <div>
                        <h4 className="text-xl font-black uppercase tracking-tight">Session {match.gameCode}</h4>
                        <p className="text-text-dim text-sm">{match.endedAt?.toDate().toLocaleDateString()} at {match.endedAt?.toDate().toLocaleTimeString()}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Winner</span>
                        <div className="flex items-center gap-2 text-accent-rose font-bold">
                          <TrophyIcon className="w-4 h-4" /> {match.winnerNickname}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Total Wealth</span>
                        <div className="flex items-center gap-2 text-accent-emerald font-bold">
                          <TrendingUp className="w-4 h-4" /> ${match.totalWealth.toLocaleString()}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Players</span>
                        <div className="font-bold text-white">{match.playerCount}</div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-text-dim">Correct</span>
                        <div className="font-bold text-white">{match.totalCorrectAnswers}</div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* StoneKit Viewer Modal */}
      <AnimatePresence>
        {viewingKit && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-bg/95 backdrop-blur-xl p-6 flex items-center justify-center overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-2xl w-full bg-card-host border border-white/10 p-10 rounded-[3rem] space-y-8 shadow-2xl my-8"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className="text-xs font-black uppercase tracking-widest text-accent-rose">StoneKit Viewer</span>
                  <h2 className="text-4xl font-black uppercase tracking-tight">{viewingKit.title}</h2>
                  <p className="text-text-dim">{viewingKit.description}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setViewingKit(null)} className="text-text-dim hover:text-white">
                  <X className="w-6 h-6" />
                </Button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-4 custom-scrollbar">
                {viewingKit.questions.map((q, i) => (
                  <div key={i} className="p-6 bg-white/5 rounded-2xl border border-white/5 space-y-3">
                    <h4 className="font-bold text-lg">{q.text}</h4>
                    <div className="grid grid-cols-2 gap-2">
                      {q.answers.map((a, ai) => (
                        <div key={ai} className={`p-2 rounded-lg text-xs font-bold ${q.correctIndex === ai ? 'bg-accent-emerald/20 text-accent-emerald' : 'bg-white/5 text-white/40'}`}>
                          {a}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-4 pt-4">
                <Button onClick={() => saveToLibrary(viewingKit)} className="flex-1 h-16 bg-white/5 hover:bg-white/10 text-white font-bold rounded-2xl border border-white/10">
                  <Save className="w-5 h-5 mr-2" /> SAVE TO MY LIBRARY
                </Button>
                <Button onClick={() => onHost(viewingKit)} className="flex-1 h-16 bg-accent-emerald hover:bg-accent-emerald/90 text-white font-bold rounded-2xl shadow-lg">
                  <Play className="w-5 h-5 mr-2" /> HOST NOW
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
