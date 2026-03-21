import React, { useState, useMemo } from 'react';
import { useStore, SavedSession } from '../store/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BrainCircuit, CheckSquare, Square, Calendar, Target, ListChecks, CheckCircle2 } from 'lucide-react';
import { formatDate } from '../lib/constants';
import SessionAnalysis from '../components/SessionAnalysis';
import { motion, AnimatePresence } from 'motion/react';

export default function Analysis() {
    const { savedSessions } = useStore();
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [showAnalysis, setShowAnalysis] = useState(false);

    // If sessions get deleted or changed, ensure selected state remains valid
    const validSavedSessions = savedSessions;

    const toggleOne = (id: string) => {
        const newSelected = new Set(selected);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelected(newSelected);
        setShowAnalysis(false); // Hide analysis if selection changes
    };

    const toggleAll = () => {
        if (selected.size === validSavedSessions.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(validSavedSessions.map(s => s.id)));
        }
        setShowAnalysis(false);
    };

    const extractSessionStats = (session: SavedSession) => {
        let qCount = 0;
        let correctCount = 0;

        session.batches.forEach(b => {
            const results = Object.values(b.results);
            qCount += results.length;
            correctCount += results.filter(r => r.isCorrect).length;
        });

        return {
            batches: session.batches.length,
            questions: qCount,
            accuracy: qCount > 0 ? Math.round((correctCount / qCount) * 100) : 0
        };
    };

    const selectedSessions = useMemo(() => {
        return validSavedSessions.filter(s => selected.has(s.id));
    }, [selected, validSavedSessions]);

    const selectedQuestionsCount = selectedSessions.reduce((acc, s) => {
        return acc + extractSessionStats(s).questions;
    }, 0);

    if (validSavedSessions.length === 0) {
        return (
            <div className="max-w-4xl mx-auto space-y-6">
                <h1 className="text-3xl font-serif font-bold text-hunter-green">Performance Analysis</h1>
                <Card className="border-old-border bg-cream-card/50">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-old-ink/60 text-center">
                        <BrainCircuit className="w-12 h-12 mb-4 opacity-50" />
                        <h3 className="text-lg font-medium text-old-ink mb-2">No Practice Data Yet</h3>
                        <p className="max-w-md">Complete some practice sessions to unlock deep performance insights, time management flags, and mistake analysis across your entire history.</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const allSelected = selected.size === validSavedSessions.length && validSavedSessions.length > 0;

    return (
        <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in duration-500 pb-12">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-serif font-bold text-hunter-green">Performance Analysis</h1>
                    <p className="text-old-ink/70 mt-1">Select one or more practice sessions to generate a combined performance report.</p>
                </div>

                <AnimatePresence>
                    {selected.size > 0 && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <Button
                                onClick={() => setShowAnalysis(true)}
                                className="bg-hunter-green hover:bg-hunter-green/90 text-white whitespace-nowrap"
                            >
                                <BrainCircuit className="w-4 h-4 mr-2" />
                                Analyse {selected.size} Session{selected.size !== 1 ? 's' : ''} ({selectedQuestionsCount} Qs)
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Session Picker List */}
            <Card className="border-old-border bg-white overflow-hidden shadow-sm">
                <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-cream-card/50 border-b border-old-border/50 text-sm font-medium text-hunter-green">
                    <button
                        onClick={toggleAll}
                        className="flex items-center space-x-3 text-hunter-green hover:text-hunter-green/70 transition-colors py-1"
                    >
                        {allSelected ? <CheckSquare className="w-5 h-5" /> : <Square className="w-5 h-5 text-old-ink/30" />}
                        <span>Select All History</span>
                    </button>
                    <span className="text-old-ink/60 text-xs uppercase tracking-wider hidden sm:block">
                        {savedSessions.length} total session{savedSessions.length !== 1 ? 's' : ''} saved
                    </span>
                </div>

                <div className="divide-y divide-old-border/30 max-h-[300px] overflow-y-auto">
                    {validSavedSessions.map(session => {
                        const isSelected = selected.has(session.id);
                        const stats = extractSessionStats(session);

                        return (
                            <div
                                key={session.id}
                                onClick={() => toggleOne(session.id)}
                                className={`flex items-center px-4 sm:px-6 py-4 cursor-pointer transition-colors group
                  ${isSelected ? 'bg-hunter-green/5' : 'hover:bg-muted-gold/5'}`}
                            >
                                <div className="mr-4">
                                    {isSelected ? (
                                        <CheckSquare className="w-5 h-5 text-hunter-green" />
                                    ) : (
                                        <Square className="w-5 h-5 text-old-ink/30 group-hover:text-muted-gold/50 transition-colors" />
                                    )}
                                </div>

                                <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2 sm:gap-4 items-center">
                                    <div className="sm:col-span-5 flex flex-col">
                                        <span className={`font-semibold text-base transition-colors ${isSelected ? 'text-hunter-green' : 'text-old-ink'}`}>
                                            {session.name}
                                        </span>
                                        <span className="text-xs text-old-ink/50 flex items-center mt-0.5">
                                            <Calendar className="w-3 h-3 mr-1" />
                                            {formatDate(session.createdAt)}
                                        </span>
                                    </div>

                                    <div className="sm:col-span-3 flex items-center space-x-4 text-sm text-old-ink/70">
                                        <span className="flex items-center" title="Batches">
                                            <ListChecks className="w-4 h-4 mr-1.5 opacity-60" />
                                            {stats.batches} Batch{stats.batches !== 1 ? 'es' : ''}
                                        </span>
                                    </div>

                                    <div className="sm:col-span-4 flex items-center justify-end space-x-4 text-sm text-old-ink/70">
                                        <span className="flex items-center bg-gray-50 px-2 py-1 rounded border border-old-border/50">
                                            {stats.questions} Qs
                                        </span>
                                        {stats.questions > 0 ? (
                                            <span className={`font-medium w-16 text-right flex items-center justify-end
                              ${stats.accuracy >= 70 ? 'text-hunter-green' :
                                                    stats.accuracy < 50 ? 'text-red-600' : 'text-muted-gold'}`}
                                            >
                                                {stats.accuracy >= 70 && <CheckCircle2 className="w-3 h-3 mr-1" />}
                                                {stats.accuracy}%
                                            </span>
                                        ) : (
                                            <span className="italic text-old-ink/40 w-16 text-right">0%</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            {/* Analysis Section */}
            <AnimatePresence>
                {showAnalysis && selectedSessions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="pt-4 border-t-2 border-old-border border-dashed"
                    >
                        <div className="mb-6">
                            <h2 className="text-2xl font-serif font-bold text-hunter-green">
                                {selectedSessions.length === 1
                                    ? `Analysis: ${selectedSessions[0].name}`
                                    : `Combined Analysis (${selectedSessions.length} sessions)`}
                            </h2>
                            <p className="text-old-ink/60 text-sm mt-1">Metrics extracted from {selectedQuestionsCount} answered questions.</p>
                        </div>

                        <SessionAnalysis sessions={selectedSessions} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
