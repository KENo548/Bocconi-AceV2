import React, { createContext, useContext, useState, useEffect } from 'react';
import { GeneratedQuestion } from '../services/groq';

export interface QuestionResult {
  id: string;
  timestamp: number;
  topic: string;
  subtopic: string;
  question: string;
  timeTaken: number;        // per-question seconds, NOT session elapsed
  isCorrect: boolean;
  userAnswer: string;
  correctAnswer: string;
  explanation: string;
  options: string[];        // NEW — needed for penalty calculation
  analysis?: {
    analysis: string;
    advice: string;
    recommendations: string[];
  };
}

export interface QuestionConfig {
  id: string;
  topic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  source?: 'AI' | 'Mock';
}

export interface QuestionBatch {
  id: string;
  createdAt: number;
  configs: QuestionConfig[];
  questions: GeneratedQuestion[];
  results: Record<number, QuestionResult>;   // key = question index
  selectedOptions: Record<number, string>;
  totalTime: number;          // elapsed seconds for this batch
  isTimerRunning: boolean;
  qTimers?: Record<number, { isRunning: boolean; elapsed: number; startTotalTime: number }>;
}

export interface SavedSession {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  batches: QuestionBatch[];
}

export interface SavedPaper {
  id: string;
  name: string;
  createdAt: number;
  questions: GeneratedQuestion[];
}

export interface ActiveSession {
  savedSessionId: string | null;
  name: string;
  batches: QuestionBatch[];
  activeBatchId: string | null;
}

export interface PaperBuilderState {
  configs: QuestionConfig[];
  generatedQuestions: (GeneratedQuestion & { id: string })[];
  acceptedQuestions: GeneratedQuestion[];
  paperName: string;
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

interface StoreContextType {
  savedSessions: SavedSession[];
  activeSession: ActiveSession | null;
  setActiveSession: React.Dispatch<React.SetStateAction<ActiveSession | null>>;
  saveSession: (session: ActiveSession) => SavedSession;
  deleteSession: (id: string) => void;
  mockQuestions: GeneratedQuestion[];
  addMockQuestions: (q: GeneratedQuestion[]) => void;
  clearMockQuestions: () => void;
  isChatOpen: boolean;
  chatContext: string | null;
  openChat: (context?: string) => void;
  closeChat: () => void;
  papers: SavedPaper[];
  addPaper: (paper: SavedPaper) => void;
  deletePaper: (id: string) => void;
  paperBuilderState: PaperBuilderState;
  setPaperBuilderState: React.Dispatch<React.SetStateAction<PaperBuilderState>>;
}

const StoreContext = createContext<StoreContextType | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [savedSessions, setSavedSessions] = useState<SavedSession[]>(() =>
    loadFromStorage('bocconi-sessions', [])
  );

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() =>
    loadFromStorage('bocconi-active', null)
  );

  const [mockQuestions, setMockQuestions] = useState<GeneratedQuestion[]>(() =>
    loadFromStorage('bocconi-mock-questions', [])
  );

  const [papers, setPapers] = useState<SavedPaper[]>(() =>
    loadFromStorage('bocconi-papers', [])
  );

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatContext, setChatContext] = useState<string | null>(null);

  const [paperBuilderState, setPaperBuilderState] = useState<PaperBuilderState>(() =>
    loadFromStorage('bocconi-paper-builder-state', {
      configs: [{ id: crypto.randomUUID(), topic: "Algebra", difficulty: "Medium", source: "AI" }],
      generatedQuestions: [],
      acceptedQuestions: [],
      paperName: ""
    })
  );

  useEffect(() => {
    localStorage.setItem('bocconi-paper-builder-state', JSON.stringify(paperBuilderState));
  }, [paperBuilderState]);

  useEffect(() => {
    localStorage.setItem('bocconi-papers', JSON.stringify(papers));
  }, [papers]);

  useEffect(() => {
    localStorage.setItem('bocconi-sessions', JSON.stringify(savedSessions));
  }, [savedSessions]);

  useEffect(() => {
    localStorage.setItem('bocconi-mock-questions', JSON.stringify(mockQuestions));
  }, [mockQuestions]);

  useEffect(() => {
    if (activeSession) {
      const toSave = {
        ...activeSession,
        batches: activeSession.batches.map(b => ({ ...b, isTimerRunning: false })),
      };
      localStorage.setItem('bocconi-active', JSON.stringify(toSave));
    } else {
      localStorage.removeItem('bocconi-active');
    }
  }, [activeSession]);

  const saveSession = (sessionToSave: ActiveSession): SavedSession => {
    let saved: SavedSession;
    if (sessionToSave.savedSessionId) {
      // Update existing
      saved = {
        id: sessionToSave.savedSessionId,
        name: sessionToSave.name,
        createdAt: savedSessions.find(s => s.id === sessionToSave.savedSessionId)?.createdAt || Date.now(),
        updatedAt: Date.now(),
        batches: sessionToSave.batches,
      };
      setSavedSessions(prev => prev.map(s => s.id === saved.id ? saved : s));
    } else {
      // Create new
      saved = {
        id: crypto.randomUUID(),
        name: sessionToSave.name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        batches: sessionToSave.batches,
      };
      setSavedSessions(prev => [saved, ...prev]);
    }

    return saved;
  };

  const deleteSession = (id: string) => {
    setSavedSessions(prev => prev.filter(s => s.id !== id));
    if (activeSession?.savedSessionId === id) {
      setActiveSession(null);
    }
  };

  const addMockQuestions = (questions: GeneratedQuestion[]) => {
    setMockQuestions((prev) => [...prev, ...questions]);
  };

  const clearMockQuestions = () => setMockQuestions([]);

  const openChat = (context?: string) => {
    if (context) setChatContext(context);
    setIsChatOpen(true);
  };

  const closeChat = () => {
    setIsChatOpen(false);
    setChatContext(null);
  };

  const addPaper = (paper: SavedPaper) => setPapers(prev => [paper, ...prev]);
  const deletePaper = (id: string) => setPapers(prev => prev.filter(p => p.id !== id));

  return (
    <StoreContext.Provider
      value={{
        savedSessions,
        activeSession,
        setActiveSession,
        saveSession,
        deleteSession,
        mockQuestions,
        addMockQuestions,
        clearMockQuestions,
        isChatOpen,
        chatContext,
        openChat,
        closeChat,
        papers,
        addPaper,
        deletePaper,
        paperBuilderState,
        setPaperBuilderState,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const context = useContext(StoreContext);
  if (!context) throw new Error('useStore must be used within StoreProvider');
  return context;
}
