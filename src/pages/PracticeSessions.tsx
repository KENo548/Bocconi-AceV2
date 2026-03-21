import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useStore, SavedSession, QuestionBatch } from '../store/useStore';
import { formatDate } from '../lib/constants';
import QuestionBatchView from '../components/QuestionBatchView';
import SessionAnalysis from '../components/SessionAnalysis';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { BrainCircuit, Clock, Target, Plus, ChevronLeft, Edit2, Check, X, Trash2 } from 'lucide-react';

export default function PracticeSessions() {
    const { savedSessions, activeSession, setActiveSession, saveSession, deleteSession } = useStore();
    const [view, setView] = useState<'list' | 'session'>(activeSession ? 'session' : 'list');
    const [activeTab, setActiveTab] = useState<'practice' | 'analysis'>('practice');
    const [isEditingName, setIsEditingName] = useState(false);
    const [editNameValue, setEditNameValue] = useState("");
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

    const getSessionSummary = (session: SavedSession) => {
        let qCount = 0;
        let correctCount = 0;
        let totalTime = 0;
        session.batches.forEach(b => {
            const results = Object.values(b.results);
            qCount += results.length;
            correctCount += results.filter(r => r.isCorrect).length;
            totalTime += b.totalTime;
        });
        return {
            batches: session.batches.length,
            questions: qCount,
            accuracy: qCount > 0 ? Math.round((correctCount / qCount) * 100) : 0,
            totalTime
        };
    };

    const handleNewSession = () => {
        const newBatch: QuestionBatch = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            configs: [{ id: crypto.randomUUID(), topic: 'Algebra', difficulty: 'Medium', source: 'AI' }],
            questions: [],
            results: {},
            selectedOptions: {},
            totalTime: 0,
            isTimerRunning: false,
        };

        setActiveSession({
            savedSessionId: null,
            name: `Session – ${formatDate(Date.now())}`,
            batches: [newBatch],
            activeBatchId: newBatch.id
        });
        setView('session');
        setActiveTab('practice');
    };

    const handleOpenSession = (session: SavedSession) => {
        setActiveSession({
            savedSessionId: session.id,
            name: session.name,
            batches: session.batches,
            activeBatchId: session.batches[0]?.id || null,
        });
        setView('session');
        setActiveTab('practice');
    };

    const handleSave = () => {
        setActiveSession(prev => {
            if (!prev) return null;
            const saved = saveSession(prev);
            return { ...prev, savedSessionId: saved.id };
        });
    };

    const handleBack = () => {
        // Ensure final save before leaving
        if (activeSession) {
            saveSession(activeSession);
        }
        setActiveSession(null);
        setView('list');
    };

    // Auto-save: debounce 2 seconds after any activeSession change
    const autoSaveRef = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        if (!activeSession) return;
        if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        autoSaveRef.current = setTimeout(() => {
            // Read the latest activeSession directly (it's in scope via closure)
            if (activeSession) {
                const saved = saveSession(activeSession);
                // Only update savedSessionId if this is the first save (new session)
                if (!activeSession.savedSessionId) {
                    setActiveSession(prev => prev ? { ...prev, savedSessionId: saved.id } : null);
                }
            }
        }, 2000);
        return () => {
            if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
        };
    }, [activeSession]);

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setConfirmDeleteId(id);
    };

    const confirmDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        deleteSession(id);
        setConfirmDeleteId(null);
    };

    const cancelDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        setConfirmDeleteId(null);
    };

    const startNameEdit = () => {
        if (activeSession) {
            setEditNameValue(activeSession.name);
            setIsEditingName(true);
        }
    };

    const commitNameEdit = () => {
        if (editNameValue.trim()) {
            setActiveSession(prev => prev ? { ...prev, name: editNameValue.trim() } : null);
        }
        setIsEditingName(false);
    };

    const cancelNameEdit = () => {
        setIsEditingName(false);
    };

    const handleBatchUpdate = useCallback((batchId: string, updated: QuestionBatch) => {
        setActiveSession(prev => {
            if (!prev) return null;
            return { ...prev, batches: prev.batches.map(b => b.id === batchId ? updated : b) };
        });
    }, [setActiveSession]);

    const handleAddBatch = () => {
        const newBatch: QuestionBatch = {
            id: crypto.randomUUID(),
            createdAt: Date.now(),
            configs: [{ id: crypto.randomUUID(), topic: 'Algebra', difficulty: 'Medium', source: 'AI' }],
            questions: [],
            results: {},
            selectedOptions: {},
            totalTime: 0,
            isTimerRunning: false,
        };
        setActiveSession(prev => {
            if (!prev) return null;
            return {
                ...prev,
                batches: [...prev.batches, newBatch],
                activeBatchId: newBatch.id
            };
        });
    };

    const handleDeleteBatch = useCallback((batchId: string) => {
        setActiveSession(prev => {
            if (!prev) return null;
            const remaining = prev.batches.filter(b => b.id !== batchId);
            return { ...prev, batches: remaining };
        });
    }, [setActiveSession]);

    const handleDeleteSession = () => {
        if (activeSession?.savedSessionId) {
            deleteSession(activeSession.savedSessionId);
        }
        setActiveSession(null);
        setView('list');
    };

    const handleTabSwitch = (tab: 'practice' | 'analysis') => {
        if (tab === 'analysis') {
            handleSave();
        }
        setActiveTab(tab);
    };

    if (view === 'list') {
        return (
            <div className="max-w-4xl mx-auto space-y-6 fade-in animate-in duration-500">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-serif font-bold text-hunter-green">Practice Sessions</h1>
                        <p className="text-old-ink/70 mt-1">Review your past performance or start a new focused practice session.</p>
                    </div>
                    <Button onClick={handleNewSession} className="bg-hunter-green hover:bg-hunter-green/90 text-white shrink-0">
                        <Plus className="w-4 h-4 mr-2" />
                        Start a New Practice Session
                    </Button>
                </div>

                {savedSessions.length === 0 ? (
                    <Card className="border-old-border bg-cream-card/50">
                        <CardContent className="flex flex-col items-center justify-center py-16 text-old-ink/60 text-center">
                            <BrainCircuit className="w-12 h-12 mb-4 opacity-50" />
                            <h3 className="text-lg font-medium text-old-ink mb-2">No Saved Sessions</h3>
                            <p className="max-w-md mb-6">Start a new practice session to build your skills and track your progress over time.</p>
                            <Button onClick={handleNewSession} className="bg-muted-gold hover:bg-muted-gold/90 text-white">
                                Start Practicing
                            </Button>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4">
                        {savedSessions.map(session => {
                            const stats = getSessionSummary(session);
                            return (
                                <Card
                                    key={session.id}
                                    className="border-old-border bg-white hover:border-muted-gold/50 cursor-pointer transition-all group overflow-hidden"
                                    onClick={() => handleOpenSession(session)}
                                >
                                    <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-old-border/30">
                                        <div className="p-5 flex-1 relative">
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <h3 className="font-serif text-lg font-bold text-hunter-green group-hover:text-muted-gold transition-colors">{session.name}</h3>
                                                    <p className="text-xs text-old-ink/50 mt-1">{formatDate(session.createdAt)}</p>
                                                </div>
                                                {confirmDeleteId === session.id ? (
                                                    <div className="flex items-center space-x-2 bg-red-50 px-2 py-1 rounded-sm border border-red-100 hidden sm:flex" onClick={e => e.stopPropagation()}>
                                                        <span className="text-xs font-semibold text-red-600">Delete?</span>
                                                        <button onClick={(e) => confirmDelete(e, session.id)} className="text-xs px-2 py-0.5 bg-red-600 text-white rounded-sm hover:bg-red-700">Yes</button>
                                                        <button onClick={cancelDelete} className="text-xs px-2 py-0.5 bg-white text-old-ink rounded-sm border border-old-border hover:bg-gray-50">No</button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={(e) => handleDelete(e, session.id)}
                                                        className="p-2 text-old-ink/30 hover:text-red-500 hover:bg-red-50 rounded-sm transition-colors opacity-0 group-hover:opacity-100 hidden sm:block"
                                                        title="Delete Session"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                )}
                                            </div>

                                            {stats.questions > 0 && (
                                                <div className="mt-4 flex items-center space-x-2">
                                                    {stats.accuracy >= 70 ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#4A5D23]/10 text-[#4A5D23] border border-[#4A5D23]/20">
                                                            Strong Performance
                                                        </span>
                                                    ) : stats.accuracy < 50 ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-[#7A3E3E]/10 text-[#7A3E3E] border border-[#7A3E3E]/20">
                                                            Needs Work
                                                        </span>
                                                    ) : null}
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-5 flex flex-wrap sm:flex-nowrap items-center sm:justify-end gap-6 sm:w-auto bg-cream-card/30">
                                            <div className="text-center">
                                                <span className="block text-xl font-bold text-old-ink">{stats.questions}</span>
                                                <span className="block text-[10px] uppercase tracking-wider text-old-ink/50">Questions</span>
                                            </div>
                                            <div className="text-center">
                                                <span className="block text-xl font-bold text-old-ink">{stats.accuracy}%</span>
                                                <span className="block text-[10px] uppercase tracking-wider text-old-ink/50">Accuracy</span>
                                            </div>
                                            <div className="text-center">
                                                <span className="block text-xl font-bold flex items-center justify-center text-old-ink"><Clock className="w-4 h-4 mr-1 text-muted-gold" />{Math.floor(stats.totalTime / 60)}m {stats.totalTime % 60}s</span>
                                                <span className="block text-[10px] uppercase tracking-wider text-old-ink/50">Time taken</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    }

    // Session View
    if (!activeSession) return null;

    const analysisSessionData = savedSessions.find(s => s.id === activeSession.savedSessionId);

    return (
        <div className="max-w-5xl mx-auto space-y-6 fade-in animate-in duration-300">
            {/* Top Bar */}
            <div className="bg-white p-4 rounded-sm border border-old-border shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4 sticky top-[4.5rem] z-30">
                <div className="flex items-center space-x-4 w-full sm:w-auto">
                    <button
                        onClick={handleBack}
                        className="p-2 text-old-ink/60 hover:text-hunter-green hover:bg-cream-bg rounded-sm transition-colors flex items-center shrink-0"
                    >
                        <ChevronLeft className="w-5 h-5 mr-1" />
                        <span className="hidden sm:inline font-medium text-sm">Sessions</span>
                    </button>

                    <div className="w-px h-6 bg-old-border/50 hidden sm:block"></div>

                    <div className="flex-1 flex items-center min-w-0 pr-2">
                        {isEditingName ? (
                            <div className="flex items-center space-x-2 w-full max-w-sm">
                                <input
                                    autoFocus
                                    type="text"
                                    value={editNameValue}
                                    onChange={(e) => setEditNameValue(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') commitNameEdit();
                                        if (e.key === 'Escape') cancelNameEdit();
                                    }}
                                    className="w-full px-3 py-1.5 text-sm font-semibold text-hunter-green bg-cream-bg border border-muted-gold rounded-sm focus:outline-none"
                                />
                                <button onClick={commitNameEdit} className="p-1.5 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4" /></button>
                                <button onClick={cancelNameEdit} className="p-1.5 text-red-600 hover:bg-red-50 rounded"><X className="w-4 h-4" /></button>
                            </div>
                        ) : (
                            <div className="flex items-center group overflow-hidden">
                                <h2 className="text-lg font-serif font-bold text-hunter-green truncate mr-2" title={activeSession.name}>
                                    {activeSession.name}
                                </h2>
                                <button
                                    onClick={startNameEdit}
                                    className="p-1.5 text-old-ink/30 hover:text-muted-gold rounded-sm opacity-0 group-hover:opacity-100 transition-all shrink-0"
                                >
                                    <Edit2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto space-x-4">
                    <div className="flex bg-cream-bg p-1 rounded-sm border border-old-border/50 shrink-0">
                        <button
                            onClick={() => handleTabSwitch('practice')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${activeTab === 'practice' ? 'bg-white shadow-sm text-hunter-green' : 'text-old-ink/60 hover:text-old-ink'}`}
                        >
                            Practice
                        </button>
                        <button
                            onClick={() => handleTabSwitch('analysis')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-sm transition-colors ${activeTab === 'analysis' ? 'bg-white shadow-sm text-hunter-green' : 'text-old-ink/60 hover:text-old-ink'}`}
                        >
                            Analysis
                        </button>
                    </div>
                    <Button
                        onClick={handleDeleteSession}
                        variant="outline"
                        className="shrink-0 border-red-200 text-old-ink/60 hover:text-red-600 hover:bg-red-50"
                    >
                        <Trash2 className="w-4 h-4 sm:mr-2" />
                        <span className="hidden sm:inline">Delete</span>
                    </Button>
                </div>
            </div>

            {/* Content Area */}
            <div className="pt-2">
                {activeTab === 'practice' && (
                    <div className="space-y-6 pb-20">
                        {activeSession.batches.map((batch, idx) => (
                            <QuestionBatchView
                                key={batch.id}
                                batch={batch}
                                batchIndex={idx}
                                onBatchUpdate={(updated) => handleBatchUpdate(batch.id, updated)}
                                onDeleteBatch={activeSession.batches.length > 1 ? () => handleDeleteBatch(batch.id) : undefined}
                            />
                        ))}

                        <button
                            onClick={handleAddBatch}
                            className="w-full py-6 border-2 border-dashed border-old-border/60 hover:border-muted-gold rounded-sm text-old-ink/50 hover:text-hunter-green font-medium transition-colors flex flex-col items-center justify-center space-y-2 group bg-cream-card/30 hover:bg-white"
                        >
                            <div className="w-10 h-10 rounded-full bg-cream-bg group-hover:bg-muted-gold/10 flex items-center justify-center transition-colors">
                                <Plus className="w-5 h-5" />
                            </div>
                            <span>Add another question batch</span>
                        </button>
                    </div>
                )}

                {activeTab === 'analysis' && (
                    <div className="bg-white p-6 rounded-sm border border-old-border">
                        {!activeSession.savedSessionId || !analysisSessionData ? (
                            <div className="text-center py-16 flex flex-col items-center">
                                <Target className="w-12 h-12 text-old-ink/20 mb-4" />
                                <h3 className="text-lg font-medium text-old-ink mb-2">Save Required for Analysis</h3>
                                <p className="text-old-ink/60 mb-6">Please save your session first to generate deep performance analytics.</p>
                                <Button onClick={handleSave} className="bg-hunter-green text-white hover:bg-hunter-green/90">
                                    <BrainCircuit className="w-4 h-4 mr-2" /> Generate Analytics
                                </Button>
                            </div>
                        ) : (
                            <SessionAnalysis sessions={[analysisSessionData!]} />
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
