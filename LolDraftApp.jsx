import React, { useState, useEffect, useCallback } from 'react';
import { Plus, X, Trash2, ChevronDown, ChevronUp, Zap, Loader2, Save } from 'lucide-react';
// Removed static top-level imports for Firebase due to "Dynamic require" error.
// The functions will now be loaded dynamically inside the useEffect and other functions.

// --- Global Constants from Canvas Environment ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// The single ID for the shared draft document
const DRAFT_DOC_ID = 'main-team-draft';

// Gemini API Configuration
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=";
const API_KEY = ""; // Canvas provides this dynamically

const LoLDraftApp = () => {
  const [activeTab, setActiveTab] = useState('draft');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [userId, setUserId] = useState(null);
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState(null);

  const [allyTeam, setAllyTeam] = useState([
    { role: 'Top', champion: '', notes: '' },
    { role: 'Jungle', champion: '', notes: '' },
    { role: 'Mid', champion: '', notes: '' },
    { role: 'ADC', champion: '', notes: '' },
    { role: 'Support', champion: '', notes: '' }
  ]);
  const [enemyTeam, setEnemyTeam] = useState(allyTeam.map(c => ({ ...c })));

  const [gameplan, setGameplan] = useState('');
  const [strengths, setStrengths] = useState('');
  const [weaknesses, setWeaknesses] = useState('');
  const [expandedNotes, setExpandedNotes] = useState({});

  // Map state (using role names for clarity)
  const [tokens, setTokens] = useState({
    ally: {
      Top: { x: 15, y: 15 }, Jungle: { x: 25, y: 25 }, Mid: { x: 50, y: 50 }, ADC: { x: 85, y: 85 }, Support: { x: 82, y: 88 }
    },
    enemy: {
      Top: { x: 85, y: 15 }, Jungle: { x: 75, y: 25 }, Mid: { x: 50, y: 50 }, ADC: { x: 15, y: 85 }, Support: { x: 18, y: 88 }
    }
  });
  const [dragging, setDragging] = useState(null);

  // --- Firebase Initialization and Auth ---
  useEffect(() => {
    const initializeFirebase = async () => {
      try {
        // Dynamically import core Firebase functions
        const { initializeApp } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js');
        const { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js');
        const { getFirestore } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
        
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const userAuth = getAuth(app);
        setDb(firestore);
        setAuth(userAuth);

        const unsubscribe = onAuthStateChanged(userAuth, async (user) => {
          if (!user) {
            if (initialAuthToken) {
              await signInWithCustomToken(userAuth, initialAuthToken);
            } else {
              await signInAnonymously(userAuth);
            }
          }
          setUserId(userAuth.currentUser?.uid || 'anonymous');
          setIsAuthReady(true);
        });
        return unsubscribe;
      } catch (e) {
        console.error("Firebase initialization failed:", e);
      }
    };

    const cleanupPromise = initializeFirebase();
    // Return cleanup function to unsubscribe from auth state changes
    return () => {
      cleanupPromise.then(unsub => unsub && unsub());
    };
  }, []);

  // --- Firestore Save Function ---
  const saveDraft = useCallback(async (currentData) => {
    if (!db || !userId) return;

    setIsSaving(true);
    try {
      // Dynamically import required Firestore functions for writing
      const { doc, setDoc } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');

      // Public collection path: /artifacts/{appId}/public/data/lol-drafts/{documentId}
      const draftRef = doc(db, `artifacts/${appId}/public/data/lol-drafts/${DRAFT_DOC_ID}`);
      await setDoc(draftRef, {
        allyTeam: currentData.allyTeam,
        enemyTeam: currentData.enemyTeam,
        gameplan: currentData.gameplan,
        strengths: currentData.strengths,
        weaknesses: currentData.weaknesses,
        tokens: currentData.tokens,
        updatedAt: Date.now(),
        updatedBy: userId,
      });
    } catch (e) {
      console.error("Error saving draft to Firestore:", e);
    } finally {
      setIsSaving(false);
    }
  }, [db, userId]);

  // Use a single debounced effect to save all related states
  useEffect(() => {
    if (!isAuthReady || !db) return;

    const currentData = { allyTeam, enemyTeam, gameplan, strengths, weaknesses, tokens };

    const handler = setTimeout(() => {
      saveDraft(currentData);
    }, 500); // Debounce to prevent rapid writes

    return () => clearTimeout(handler);
  }, [allyTeam, enemyTeam, gameplan, strengths, weaknesses, tokens, isAuthReady, db, saveDraft]);

  // --- Firestore Load (onSnapshot) ---
  useEffect(() => {
    if (!isAuthReady || !db) return;

    const loadDraft = async () => {
        // Dynamically import required Firestore functions for reading
        const { doc, onSnapshot } = await import('https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js');
        
        const draftRef = doc(db, `artifacts/${appId}/public/data/lol-drafts/${DRAFT_DOC_ID}`);

        const unsubscribe = onSnapshot(draftRef, (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            // Using allyTeam/enemyTeam as fallback ensures state consistency during initial load
            setAllyTeam(data.allyTeam || allyTeam);
            setEnemyTeam(data.enemyTeam || enemyTeam);
            setGameplan(data.gameplan || '');
            setStrengths(data.strengths || '');
            setWeaknesses(data.weaknesses || '');
            setTokens(data.tokens || tokens);
          }
        }, (error) => {
          console.error("Error listening to draft snapshot:", error);
        });

        return () => unsubscribe();
    }
    
    // Call the async load function and handle cleanup
    let unsubscribeCleanup;
    loadDraft().then(cleanup => unsubscribeCleanup = cleanup);

    return () => {
      if (unsubscribeCleanup) unsubscribeCleanup();
    };

  }, [isAuthReady, db]); // Dependencies reduced as data is loaded asynchronously inside

  // --- Helper Functions ---
  const updateTeam = (team, index, field, value) => {
    const setter = team === 'ally' ? setAllyTeam : setEnemyTeam;
    const current = team === 'ally' ? allyTeam : enemyTeam;
    const updated = [...current];
    updated[index][field] = value;
    setter(updated);
  };

  const toggleNotes = (team, index) => {
    const key = `${team}-${index}`;
    setExpandedNotes(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const clearAll = () => {
    setAllyTeam(allyTeam.map(p => ({ ...p, champion: '', notes: '' })));
    setEnemyTeam(enemyTeam.map(p => ({ ...p, champion: '', notes: '' })));
    setGameplan('');
    setStrengths('');
    setWeaknesses('');
  };

  // --- Map Drag Logic ---
  const handleTokenDrag = (e, team, role) => {
    if (!dragging || dragging.team !== team || dragging.role !== role) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    
    setTokens(prev => ({
      ...prev,
      [team]: {
        ...prev[team],
        [role]: { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
      }
    }));
  };

  const handleTokenStart = (team, role) => {
    setDragging({ team, role });
  };

  const handleTokenEnd = () => {
    setDragging(null);
  };

  // --- Gemini API Call for Analysis ---
  const runAnalysis = async () => {
    const allPicks = [...allyTeam, ...enemyTeam].filter(p => p.champion.trim() !== '');

    if (allPicks.length < 10) {
      setAnalysisError("Please draft a full 10-champion team composition before running the analysis.");
      return;
    }
    
    setIsAnalyzing(true);
    setAnalysisError(null);

    const allyChampions = allyTeam.map(p => p.champion.trim()).filter(c => c).join(', ');
    const enemyChampions = enemyTeam.map(p => p.champion.trim()).filter(c => c).join(', ');

    const systemPrompt = `Act as a world-class League of Legends esports analyst. Your primary goal is to provide strategic insights into the team compositions based on professional play knowledge (pro-play).`;
    
    const userQuery = `Analyze the following two team compositions. Only consider the champions listed.

Allied Team Composition: ${allyChampions} (Top, Jungle, Mid, ADC, Support)
Enemy Team Composition: ${enemyChampions} (Top, Jungle, Mid, ADC, Support)

1. Summarize the **STRENGTHS** of the allied composition (e.g., strong engage, late-game scaling, split push).
2. Summarize the **WEAKNESSES** of the allied composition (e.g., vulnerable to dive, weak early game, lacks wave clear).
3. Provide a detailed, high-level **GAMEPLAN** for the allied team, covering Early Game (0-15 min, jungle pathing, lane focus), Mid Game (objective priority, grouping), and Late Game (win condition, team fight strategy).

Structure your response strictly into three sections, using the bolded capitalized headings exactly as requested:
**STRENGTHS**
[Content for strengths]

**WEAKNESSES**
[Content for weaknesses]

**GAMEPLAN**
[Content for gameplan]
`;

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      tools: [{ "google_search": {} }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    try {
      const response = await fetch(GEMINI_API_URL + API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      const text = result.candidates?.[0]?.content?.parts?.[0]?.text || 'No analysis generated.';

      // Parse the structured text response
      const sections = text.split(/\*\*(STRENGTHS|WEAKNESSES|GAMEPLAN)\*\*/g).filter(s => s.trim() !== '');
      
      let newStrengths = '';
      let newWeaknesses = '';
      let newGameplan = '';
      
      for (let i = 0; i < sections.length; i += 2) {
        const header = sections[i];
        const content = sections[i + 1] ? sections[i + 1].trim() : '';

        if (header === 'STRENGTHS') newStrengths = content;
        if (header === 'WEAKNESSES') newWeaknesses = content;
        if (header === 'GAMEPLAN') newGameplan = content;
      }

      // Update state, triggering Firestore save via useEffect
      setStrengths(newStrengths);
      setWeaknesses(newWeaknesses);
      setGameplan(newGameplan);

    } catch (e) {
      console.error("Gemini API call failed:", e);
      setAnalysisError(`Failed to get analysis. Check console for details. Ensure all champion names are correct.`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // --- Child Component for Team Section ---
  const TeamSection = ({ team, data, label, color }) => (
    <div className="mb-6">
      <h3 className={`text-xl font-bold mb-3 ${color} border-b border-gray-700 pb-2`}>{label}</h3>
      {data.map((player, idx) => (
        <div key={idx} className="mb-3 bg-gray-800 rounded-xl p-3 shadow-lg border border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${color.replace('text-', 'bg-')} text-white min-w-[70px] text-center`}>
              {player.role}
            </span>
            <input
              type="text"
              placeholder="Champion Name"
              value={player.champion}
              onChange={(e) => updateTeam(team, idx, 'champion', e.target.value)}
              className="flex-1 bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-yellow-500 focus:outline-none text-base transition duration-150"
            />
            <button
              onClick={() => toggleNotes(team, idx)}
              className="p-2 bg-gray-700 hover:bg-gray-600 rounded-full text-white transition duration-150 shadow-md"
              title="Toggle Notes"
            >
              {expandedNotes[`${team}-${idx}`] ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>
          </div>
          {expandedNotes[`${team}-${idx}`] && (
            <textarea
              placeholder="Notes (counters, combos, win conditions...)"
              value={player.notes}
              onChange={(e) => updateTeam(team, idx, 'notes', e.target.value)}
              className="w-full mt-2 bg-gray-900 text-gray-300 px-3 py-2 rounded-lg border border-gray-600 focus:border-yellow-500 focus:outline-none text-sm resize-none"
              rows="3"
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-inter">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-10 shadow-xl">
        <div className="p-4">
          <h1 className="text-2xl font-extrabold text-center text-yellow-400">LoL Draft Analyst</h1>
        </div>
        <div className="flex border-t border-gray-700">
          <button
            onClick={() => setActiveTab('draft')}
            className={`flex-1 py-3 font-bold transition duration-200 ${
              activeTab === 'draft'
                ? 'bg-blue-600 text-white shadow-inner shadow-black/20'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Draft & Strategy
          </button>
          <button
            onClick={() => setActiveTab('map')}
            className={`flex-1 py-3 font-bold transition duration-200 ${
              activeTab === 'map'
                ? 'bg-blue-600 text-white shadow-inner shadow-black/20'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            Map View
          </button>
        </div>
      </header>

      {/* Persistence/Auth Status */}
      <div className="p-2 bg-gray-700 text-xs text-center flex justify-between items-center text-gray-400">
        <span className='flex items-center gap-1'>
          <Save size={12} className={isSaving ? 'animate-pulse text-yellow-400' : 'text-green-500'}/>
          {isSaving ? 'Saving...' : 'Draft Saved'}
        </span>
        <span className="truncate">User: {userId} (Draft: {DRAFT_DOC_ID})</span>
      </div>

      {/* Content */}
      <main className="p-4 flex-1 overflow-y-auto">
        {activeTab === 'draft' ? (
          <div>
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={clearAll}
                className="flex items-center gap-2 px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm font-semibold transition duration-150 shadow-lg"
                title="Clear All Champions and Analysis"
              >
                <Trash2 size={16} />
                Clear Draft
              </button>
              <button
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition duration-300 shadow-xl ${
                  isAnalyzing 
                    ? 'bg-gray-500 text-gray-300 cursor-not-allowed' 
                    : 'bg-yellow-600 hover:bg-yellow-500 text-gray-900 shadow-yellow-800/50'
                }`}
                title="Generate Gameplan and Analysis"
              >
                {isAnalyzing ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
                {isAnalyzing ? 'Analyzing...' : 'AI Analyze Comp'}
              </button>
            </div>
            
            {analysisError && (
              <div className="p-3 mb-4 bg-red-900 border border-red-700 rounded-lg text-red-300 text-sm">
                Error: {analysisError}
              </div>
            )}

            {/* Team Sections */}
            <TeamSection 
              team="ally" 
              data={allyTeam} 
              label="Allied Team" 
              color="text-blue-400"
            />
            
            <TeamSection 
              team="enemy" 
              data={enemyTeam} 
              label="Enemy Team" 
              color="text-red-400"
            />

            {/* Strategy Section */}
            <div className="mt-8 pt-4 border-t border-gray-700 space-y-6">
              <h2 className="text-2xl font-bold text-yellow-400">AI Strategic Analysis</h2>
              
              <div className="bg-gray-800 p-4 rounded-xl shadow-inner">
                <label className="block text-sm font-extrabold mb-2 text-green-400 uppercase">
                  <Zap size={14} className="inline mr-1"/> Strengths
                </label>
                <textarea
                  value={strengths}
                  onChange={(e) => setStrengths(e.target.value)}
                  placeholder="AI Strengths Analysis or manually enter notes..."
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none text-sm resize-none"
                  rows="4"
                />
              </div>

              <div className="bg-gray-800 p-4 rounded-xl shadow-inner">
                <label className="block text-sm font-extrabold mb-2 text-red-400 uppercase">
                  <X size={14} className="inline mr-1"/> Weaknesses
                </label>
                <textarea
                  value={weaknesses}
                  onChange={(e) => setWeaknesses(e.target.value)}
                  placeholder="AI Weaknesses Analysis or manually enter notes..."
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-red-500 focus:outline-none text-sm resize-none"
                  rows="4"
                />
              </div>

              <div className="bg-gray-800 p-4 rounded-xl shadow-inner">
                <label className="block text-sm font-extrabold mb-2 text-blue-400 uppercase">
                  <Zap size={14} className="inline mr-1"/> Gameplan
                </label>
                <textarea
                  value={gameplan}
                  onChange={(e) => setGameplan(e.target.value)}
                  placeholder="AI Gameplan or manually enter your strategy (Early, Mid, Late game)..."
                  className="w-full bg-gray-900 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none text-sm resize-none"
                  rows="8"
                />
              </div>
            </div>

          </div>
        ) : (
          <div>
            <h2 className="text-xl font-bold mb-4 text-center">Summoner's Rift Tactical Map</h2>
            <div className="text-sm text-gray-400 mb-4 text-center">
              Drag tokens to visualize lane states, invades, or objective control points.
            </div>
            
            <div className="relative w-full aspect-square bg-gradient-to-br from-green-950 to-blue-950 rounded-xl border-4 border-gray-700 overflow-hidden shadow-2xl touch-none"
              // Desktop/Mouse events for dragging on the container
              onMouseUp={handleTokenEnd}
              onMouseLeave={handleTokenEnd}
              // Mobile/Touch events for dragging on the container
              onTouchEnd={handleTokenEnd}
            >
              {/* Simplified Map Visual - Base Background */}
              <div className="absolute inset-0 opacity-10 bg-[url('https://placehold.co/1000x1000/0d1117/1e3b56?text=SUMMONER\'S+RIFT')] bg-cover"></div>

              {/* Lane Indicators - stylistic diagonal lines */}
              <svg className="absolute inset-0 w-full h-full opacity-30">
                <line x1="10%" y1="10%" x2="90%" y2="90%" stroke="#444" strokeWidth="2" strokeDasharray="5, 5" />
                <line x1="10%" y1="90%" x2="90%" y2="10%" stroke="#444" strokeWidth="2" strokeDasharray="5, 5" />
                <circle cx="50%" cy="50%" r="5%" fill="rgba(255, 255, 255, 0.1)" stroke="#555" strokeWidth="2" />
              </svg>

              {/* Allied Tokens */}
              {Object.entries(tokens.ally).map(([role, pos]) => (
                <div
                  key={`ally-${role}`}
                  className="absolute cursor-grab active:cursor-grabbing select-none transition-shadow duration-100"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: dragging && dragging.team === 'ally' && dragging.role === role ? 20 : 10
                  }}
                  onMouseDown={() => handleTokenStart('ally', role)}
                  onMouseMove={(e) => handleTokenDrag(e, 'ally', role)}
                  onTouchStart={() => handleTokenStart('ally', role)}
                  onTouchMove={(e) => handleTokenDrag(e, 'ally', role)}
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-blue-600 rounded-full border-2 border-blue-200 shadow-xl flex flex-col items-center justify-center font-bold text-xs md:text-sm leading-none p-1 transform hover:scale-110 transition duration-150">
                    <span className='uppercase'>{role[0]}</span>
                    <span className='text-[8px] md:text-[10px] truncate w-full text-center mt-0.5 opacity-80'>{allyTeam.find(p => p.role.includes(role))?.champion.substring(0, 5) || ''}</span>
                  </div>
                </div>
              ))}

              {/* Enemy Tokens */}
              {Object.entries(tokens.enemy).map(([role, pos]) => (
                <div
                  key={`enemy-${role}`}
                  className="absolute cursor-grab active:cursor-grabbing select-none transition-shadow duration-100"
                  style={{
                    left: `${pos.x}%`,
                    top: `${pos.y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: dragging && dragging.team === 'enemy' && dragging.role === role ? 20 : 10
                  }}
                  onMouseDown={() => handleTokenStart('enemy', role)}
                  onMouseMove={(e) => handleTokenDrag(e, 'enemy', role)}
                  onTouchStart={() => handleTokenStart('enemy', role)}
                  onTouchMove={(e) => handleTokenDrag(e, 'enemy', role)}
                >
                  <div className="w-10 h-10 md:w-12 md:h-12 bg-red-600 rounded-full border-2 border-red-200 shadow-xl flex flex-col items-center justify-center font-bold text-xs md:text-sm leading-none p-1 transform hover:scale-110 transition duration-150">
                    <span className='uppercase'>{role[0]}</span>
                    <span className='text-[8px] md:text-[10px] truncate w-full text-center mt-0.5 opacity-80'>{enemyTeam.find(p => p.role.includes(role))?.champion.substring(0, 5) || ''}</span>
                  </div>
                </div>
              ))}

            </div>

            <div className="mt-6 flex justify-center gap-6 text-sm font-semibold p-3 bg-gray-800 rounded-lg shadow-inner">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-blue-600 rounded-full border-2 border-white"></div>
                <span>Allied Team</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-600 rounded-full border-2 border-white"></div>
                <span>Enemy Team</span>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default LoLDraftApp;
