import { createClient } from '@supabase/supabase-js';
const supabaseClient = createClient(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_ANON_KEY
);
import React, { useState, useRef, useEffect } from 'react';
import { QuestionBatch, QuestionConfig, QuestionResult, useStore } from '../store/useStore';
import { generateQuestions, GeneratedQuestion } from '../services/groq';
import { SYLLABUS, ALL_TOPICS, MathText, formatTime } from '../lib/constants';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Loader2, Plus, Trash2, ChevronDown, ChevronUp, CheckCircle2, XCircle, Play, Pause, RotateCcw, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import QuestionFigure from './QuestionFigure';

interface Props {
    batch: QuestionBatch;
    batchIndex: number; // for the "Batch 1", "Batch 2" label
    onBatchUpdate: (updated: QuestionBatch) => void;
    onDeleteBatch?: () => void;
}

export default function QuestionBatchView({ batch, batchIndex, onBatchUpdate, onDeleteBatch }: Props) {
    const { mockQuestions, openChat } = useStore();
    const [collapsed, setCollapsed] = useState(false);
    const [loading, setLoading] = useState(false);


    // Local state for the config form. Visible if no questions exist yet.
    const [showConfigForm, setShowConfigForm] = useState(batch.questions.length === 0);
    const [configs, setConfigs] = useState<QuestionConfig[]>(batch.configs);

    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const batchRef = useRef(batch);
    batchRef.current = batch;
    const validQsRef = useRef<GeneratedQuestion[]>([]);
    const questionStartTimes = useRef<Record<number, number>>({});
    const questionPauseStart = useRef<Record<number, number>>({});
    const questionPauseOffset = useRef<Record<number, number>>({});
    
    useEffect(() => { 
        validQsRef.current = batch.questions; 
    }, [batch.questions]);


    useEffect(() => {
        if (batch.isTimerRunning) {
            timerRef.current = setInterval(() => {
                onBatchUpdate({ ...batchRef.current, totalTime: batchRef.current.totalTime + 1 });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [batch.isTimerRunning, onBatchUpdate]);

    const handleAddConfig = () => {
        setConfigs([...configs, { id: crypto.randomUUID(), topic: ALL_TOPICS[0] || 'Algebra', difficulty: 'Medium', source: 'AI' }]);
    };

    const handleRemoveConfig = (id: string) => {
        if (configs.length > 1) {
            setConfigs(configs.filter(c => c.id !== id));
        }
    };

    const handleUpdateConfig = (id: string, field: keyof QuestionConfig, value: string) => {
        setConfigs(configs.map(c => c.id === id ? { ...c, [field]: value as any } : c));
    };

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const finalQuestions: (GeneratedQuestion | null)[] = new Array(configs.length).fill(null);

            // Fetch real mock questions from Supabase for configs with source='Mock'
            for (let i = 0; i < configs.length; i++) {
                const config = configs[i];
                if (config.source !== 'Mock') continue;

                const { data, error } = await supabaseClient
                    .from('mock_questions')
                    .select('topic, subtopic, question, options, correct_answer, explanation, difficulty, source, has_figure, figure_description, chart_data')
                    .eq('topic', config.topic)
                    .limit(50);

                if (!error && data && data.length > 0) {
                    // Avoid repeating questions already in this batch
                    const usedStems = new Set(batch.questions.map(q => q.question.substring(0, 60)));
                    const unused = data.filter(q => !usedStems.has(q.question.substring(0, 60)));
                    const pool = unused.length > 0 ? unused : data;
                    const picked = pool[Math.floor(Math.random() * pool.length)];

                    // VALIDATION: Ensure correct_answer exists in options
                    let validAnswer = picked.correct_answer as 'A' | 'B' | 'C' | 'D' | 'E';
                    if (picked.options && picked.options.length > 0) {
                        const answerIndex = picked.options.findIndex(o => 
                            o.charAt(0).toUpperCase() === validAnswer.toUpperCase()
                        );
                        if (answerIndex === -1) {
                            console.warn(`[VALIDATION] Answer "${validAnswer}" not in options for: ${picked.question.substring(0, 50)}`);
                            validAnswer = picked.options[0]?.charAt(0).toUpperCase() as 'A' | 'B' | 'C' | 'D' | 'E' || 'A';
                        }
                    }

                    finalQuestions[i] = {
                        topic: picked.topic,
                        subtopic: picked.subtopic,
                        question: picked.question,
                        options: picked.options,
                        correctAnswer: validAnswer,
                        explanation: picked.explanation,
                        difficulty: picked.difficulty,
                        source: `Mock Test (${picked.source || 'Real'})`,
                        chartData: picked.chart_data || null,
                    };
                } else {
                    console.warn(`No mock questions found for topic: ${config.topic}. Falling back to AI.`);
                }

            }

            // AI generate for anything not filled by mock fetch
            const aiConfigs = configs.filter((_, i) => finalQuestions[i] === null);
            let aiQs: GeneratedQuestion[] = [];

            if (aiConfigs.length > 0) {
                aiQs = await generateQuestions(aiConfigs);
            }

            // Merge
            let aiIndex = 0;
            const validQs: GeneratedQuestion[] = [];
            const validConfigs: QuestionConfig[] = [];

            finalQuestions.forEach((q, i) => {
                const actualQ = q === null ? aiQs[aiIndex++] : q;
                if (actualQ) {
                    validQs.push(actualQ);
                    validConfigs.push(configs[i]);
                }
            });

            const startTimes: Record<number, number> = {};
            validQs.forEach((_, i) => { startTimes[i] = Date.now(); });
            questionStartTimes.current = startTimes;

            onBatchUpdate({
                ...batch,
                configs: validConfigs,
                questions: validQs,
                results: {},
                selectedOptions: {},
                isTimerRunning: true,
            });
            setShowConfigForm(false);
        } catch (error) {
            console.error('Failed to generate questions', error);
            alert('Failed to generate questions. Please try again.');
        } finally {
            setLoading(false);
        }
    };


    const handleSubmit = async (index: number) => {
        // Prevent submitting again if already submitted
        if (batch.results[index] || !batch.selectedOptions[index]) return;

        const question = batch.questions[index];
        const userLetter = batch.selectedOptions[index].charAt(0).toUpperCase();
        const isCorrect = userLetter === question.correctAnswer;

        // Calculate final timeTaken for this question from its individual timer
        // TRY ref-based timer first (new), fallback to state-based timer (legacy)
        let timeTaken = 0;
        if (questionStartTimes.current[index]) {
            const elapsed = Date.now() - questionStartTimes.current[index];
            const pauseOffset = questionPauseOffset.current[index] || 0;
            timeTaken = Math.round((elapsed - pauseOffset) / 1000);
        } else {
            const qTimer = (batch.qTimers && batch.qTimers[index]) || { isRunning: false, elapsed: 0, startTotalTime: batch.totalTime };
            timeTaken = Math.max(0, qTimer.elapsed + (qTimer.isRunning ? batch.totalTime - qTimer.startTotalTime : 0));
        }

        const result: QuestionResult = {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            topic: question.topic,
            subtopic: question.subtopic,
            question: question.question,
            timeTaken,
            isCorrect,
            userAnswer: userLetter,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            options: question.options,
        };

        const newResults = { ...batch.results, [index]: result };

        // Stop overall timer if all questions are now answered
        const allAnswered = Object.keys(newResults).length === batch.questions.length;

        // Ensure this specific question's timer is marked as stopped
        const newQTimers = { ...(batch.qTimers || {}) };
        newQTimers[index] = { isRunning: false, elapsed: timeTaken, startTotalTime: 0 };

        onBatchUpdate({
            ...batch,
            results: newResults,
            isTimerRunning: !allAnswered,
            qTimers: newQTimers
        });

    };

    const handleSelectOption = (index: number, option: string) => {
        onBatchUpdate({
            ...batch,
            selectedOptions: {
                ...batch.selectedOptions,
                [index]: option
            }
        });
    };

    // Calculate dynamic batch score
    const toggleQTimer = (index: number) => {
        const timer = batch.qTimers?.[index] || { isRunning: false, elapsed: 0, startTotalTime: batch.totalTime };
        const newRunning = !timer.isRunning;
        let newElapsed = timer.elapsed;
        
        if (!newRunning) {
            // Pausing: record the pause start time and add to offset
            newElapsed += batch.totalTime - timer.startTotalTime;
            questionPauseStart.current[index] = Date.now();
        } else {
            // Resuming: add accumulated pause time to offset and clear pause start
            if (questionPauseStart.current[index]) {
                const pausedDuration = Date.now() - questionPauseStart.current[index];
                questionPauseOffset.current[index] = (questionPauseOffset.current[index] || 0) + pausedDuration;
                delete questionPauseStart.current[index];
            }
        }
        
        onBatchUpdate({
            ...batch,
            qTimers: {
                ...batch.qTimers,
                [index]: {
                    isRunning: newRunning,
                    elapsed: newElapsed,
                    startTotalTime: newRunning ? batch.totalTime : 0
                }
            }
        });
    };

    const resetQTimer = (index: number) => {
        onBatchUpdate({
            ...batch,
            qTimers: {
                ...batch.qTimers,
                [index]: {
                    isRunning: false,
                    elapsed: 0,
                    startTotalTime: batch.totalTime
                }
            }
        });
    };

    const batchScore = Object.values(batch.results).reduce((acc, r) => {
        return acc + (r.isCorrect ? 1 : r.options?.length === 3 ? -0.33 : -0.2);
    }, 0);

    // Delete a single question by index — re-index results, selectedOptions, qTimers
    const handleDeleteQuestion = (qIdx: number) => {
        const newQuestions = batch.questions.filter((_, i) => i !== qIdx);
        // Re-index results
        const newResults: typeof batch.results = {};
        Object.entries(batch.results).forEach(([k, v]) => {
            const n = parseInt(k);
            if (n < qIdx) newResults[n] = v;
            else if (n > qIdx) newResults[n - 1] = v;
        });
        // Re-index selectedOptions
        const newSelected: typeof batch.selectedOptions = {};
        Object.entries(batch.selectedOptions).forEach(([k, v]) => {
            const n = parseInt(k);
            if (n < qIdx) newSelected[n] = v;
            else if (n > qIdx) newSelected[n - 1] = v;
        });
        // Re-index qTimers
        const newTimers: typeof batch.qTimers = {};
        Object.entries(batch.qTimers || {}).forEach(([k, v]) => {
            const n = parseInt(k);
            if (n < qIdx) newTimers[n] = v;
            else if (n > qIdx) newTimers[n - 1] = v;
        });
        onBatchUpdate({
            ...batch,
            questions: newQuestions,
            configs: batch.configs.filter((_, i) => i !== qIdx),
            results: newResults,
            selectedOptions: newSelected,
            qTimers: newTimers,
        });
    };

    const answeredCount = Object.keys(batch.results).length;
    const isComplete = answeredCount === batch.questions.length && batch.questions.length > 0;

    return (
        <Card className="mb-6 overflow-hidden border-old-border shadow-sm">
            {/* Batch Header Bar */}
            <div
                className="bg-cream-card px-4 py-3 flex items-center justify-between cursor-pointer border-b border-old-border/50 hover:bg-muted-gold/5 transition-colors"
                onClick={() => setCollapsed(!collapsed)}
            >
                <div className="flex items-center space-x-4">
                    <h3 className="font-serif font-bold text-hunter-green">Batch {batchIndex + 1}</h3>
                    {batch.questions.length > 0 && (
                        <div className="flex space-x-3 text-sm">
                            <span className="text-old-ink/70">{answeredCount}/{batch.questions.length} answered</span>
                            <span className="font-medium text-old-ink">Score: {batchScore.toFixed(2)}</span>
                        </div>
                    )}
                    {onDeleteBatch && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeleteBatch(); }}
                            className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 border border-red-200 rounded-sm transition-colors font-medium"
                            title="Delete this entire batch"
                        >
                            <Trash2 className="w-3.5 h-3.5" />
                            Delete Batch
                        </button>
                    )}
                </div>
                <div className="flex items-center space-x-4">
                    {batch.isTimerRunning ? (
                        <div className="flex items-center space-x-2 text-hunter-green">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-hunter-green opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-hunter-green"></span>
                            </span>
                            <span className="font-mono text-sm">{formatTime(batch.totalTime)}</span>
                        </div>
                    ) : (
                        <div className="flex items-center space-x-2">
                            {(!isComplete && batch.questions.length > 0) && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-6 text-xs px-2"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        // CRITICAL: reset all unanswered question start times to NOW so it doesn't count the pause delay
                                        // Individual qTimers are driven by batch.totalTime, so they automatically resume
                                        // when totalTime resumes ticking. No need to reset explicit timestamps here.
                                        onBatchUpdate({ ...batchRef.current, isTimerRunning: true });
                                    }}
                                >
                                    Resume Session
                                </Button>
                            )}
                            <span className="font-mono text-sm text-old-ink/70 flex items-center gap-1">
                                {isComplete && <CheckCircle2 className="w-4 h-4 text-hunter-green" />}
                                {formatTime(batch.totalTime)}
                            </span>
                        </div>
                    )}
                    {collapsed ? <ChevronDown className="w-5 h-5 text-old-ink/50" /> : <ChevronUp className="w-5 h-5 text-old-ink/50" />}
                </div>
            </div>

            <AnimatePresence initial={false}>
                {!collapsed && (
                    <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: "auto" }}
                        exit={{ height: 0 }}
                        className="overflow-hidden"
                    >
                        <div className="p-4 sm:p-6 space-y-8 bg-cream-bg/50">

                            {/* Configuration Form */}
                            {showConfigForm && (
                                <div className="space-y-4 bg-white p-4 sm:p-6 rounded-sm border border-old-border shadow-sm">
                                    <div className="flex items-center justify-between mb-2">
                                        <h4 className="font-medium text-hunter-green text-sm uppercase tracking-wider">Configure Question Matrix</h4>
                                    </div>

                                    <div className="space-y-3">
                                        <AnimatePresence>
                                            {configs.map((config, index) => (
                                                <motion.div
                                                    key={config.id}
                                                    initial={{ opacity: 0, height: 0 }}
                                                    animate={{ opacity: 1, height: 'auto' }}
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="flex flex-col sm:flex-row items-start sm:items-center gap-3 bg-cream-bg p-3 rounded-sm border border-old-border/50"
                                                >
                                                    <span className="text-xs font-mono text-old-ink/40 w-6">#{index + 1}</span>
                                                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
                                                        <select
                                                            value={config.topic}
                                                            onChange={(e) => handleUpdateConfig(config.id, 'topic', e.target.value)}
                                                            className="w-full bg-white border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold text-old-ink"
                                                        >
                                                            {SYLLABUS.map(category => (
                                                                <optgroup key={category.subject} label={category.subject}>
                                                                    {category.topics.map(t => (
                                                                        <option key={t} value={t}>{t}</option>
                                                                    ))}
                                                                </optgroup>
                                                            ))}
                                                        </select>
                                                        <select
                                                            value={config.difficulty}
                                                            onChange={(e) => handleUpdateConfig(config.id, 'difficulty', e.target.value)}
                                                            disabled={config.source === 'Mock'}
                                                            className="w-full bg-white border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold text-old-ink disabled:opacity-50"
                                                        >
                                                            <option value="Easy">Easy</option>
                                                            <option value="Medium">Medium</option>
                                                            <option value="Hard">Hard</option>
                                                        </select>
                                                        <select
                                                            value={config.source || 'AI'}
                                                            onChange={(e) => handleUpdateConfig(config.id, 'source', e.target.value)}
                                                            className="w-full bg-white border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold text-old-ink"
                                                        >
                                                            <option value="AI">AI Generated</option>
                                                            <option value="Mock">Real Mock Test</option>
                                                        </select>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRemoveConfig(config.id)}
                                                        disabled={configs.length === 1}
                                                        className="p-2 text-old-ink/40 hover:text-red-600 disabled:opacity-30 transition-colors shrink-0"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </motion.div>
                                            ))}
                                        </AnimatePresence>
                                    </div>

                                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                                        <Button variant="outline" onClick={handleAddConfig} className="w-full sm:w-auto text-sm">
                                            <Plus className="w-4 h-4 mr-2" />
                                            Add Question
                                        </Button>
                                        <Button onClick={handleGenerate} disabled={loading} className="w-full sm:w-auto bg-hunter-green hover:bg-hunter-green/90 text-white">
                                            {loading ? (
                                                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Generating...</>
                                            ) : (
                                                `Generate ${configs.length} Questions`
                                            )}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Questions Area */}
                            <div className="space-y-6">
                                {batch.questions.map((question, index) => {
                                    const result = batch.results[index];
                                    const selectedOption = batch.selectedOptions[index];
                                    const isAnswered = !!result;

                                    return (
                                        <Card key={index} className={`border ${isAnswered ? (result.isCorrect ? 'border-hunter-green/30' : 'border-red-500/30') : 'border-old-border'}`}>
                                            <CardHeader className="bg-cream-card/50 pb-4">
                                                <div className="flex items-start justify-between">
                                                    <div>
                                                        <div className="flex items-center space-x-2 text-xs font-medium text-old-ink/70 mb-1">
                                                            <span className="uppercase tracking-wider">{question.topic}</span>
                                                            <span>•</span>
                                                            <span>{question.subtopic}</span>
                                                            {question.source && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span className="bg-muted-gold/20 text-muted-gold px-1.5 py-0.5 rounded-sm">Source: {question.source}</span>
                                                                </>
                                                            )}
                                                        </div>
                                                        <MathText className="text-old-ink mt-2 text-lg leading-relaxed">{question.question}</MathText>
                                                    </div>
                                                    <div className="flex items-center space-x-4">
                                                        {!isAnswered && (
                                                            <div className="flex items-center bg-white border border-old-border rounded-sm shadow-sm overflow-hidden text-sm">
                                                                <span className="px-3 py-1 font-mono text-old-ink/80 border-r border-old-border/50 bg-cream-bg flex items-center gap-1.5 min-w-[70px] justify-center">
                                                                    <Clock className="w-3.5 h-3.5 text-muted-gold" />
                                                                    {(() => {
                                                                        const qt = batch.qTimers?.[index] || { isRunning: false, elapsed: 0, startTotalTime: batch.totalTime };
                                                                        const current = Math.max(0, qt.elapsed + (qt.isRunning ? batch.totalTime - qt.startTotalTime : 0));
                                                                        return formatTime(current);
                                                                    })()}
                                                                </span>
                                                                <button
                                                                    onClick={() => toggleQTimer(index)}
                                                                    className="p-1 px-2.5 hover:bg-muted-gold/10 text-hunter-green transition-colors"
                                                                    title={batch.qTimers?.[index]?.isRunning ? "Pause Timer" : "Start Timer"}
                                                                >
                                                                    {batch.qTimers?.[index]?.isRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 ml-0.5 fill-current" />}
                                                                </button>
                                                                <button
                                                                    onClick={() => resetQTimer(index)}
                                                                    className="p-1 px-2 border-l border-old-border/50 hover:bg-red-50 text-red-600 transition-colors"
                                                                    title="Reset Timer"
                                                                >
                                                                    <RotateCcw className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        )}
                                                        <div className="flex items-center gap-2">
                                                            {!isAnswered && (
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(index); }}
                                                                    className="p-1.5 text-old-ink/25 hover:text-red-500 hover:bg-red-50 rounded-sm transition-colors"
                                                                    title="Remove this question"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-white border border-old-border flex items-center justify-center font-serif text-muted-gold font-bold">
                                                                {index + 1}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                {(question as any).isExtrapolated && (
                                                    <div className='mx-6 mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-sm
    text-xs text-amber-700 flex items-start gap-2'>
                                                        <span className='shrink-0'>⚠️</span>
                                                        <span>
                                                            This subtopic has limited coverage in your mock data (1-2 examples).
                                                            The question replicates general Bocconi style but exact pattern adherence
                                                            may be lower than well-covered subtopics.
                                                        </span>
                                                    </div>
                                                )}
                                            </CardHeader>

                                            <CardContent className="pt-6">
                                                {question.chartData && (
                                                    <div className="mb-6 bg-white p-4 border border-old-border/50 rounded-sm">
                                                        <QuestionFigure chartData={question.chartData} />
                                                    </div>
                                                )}
                                                <div className="space-y-3">
                                                    {question.options.map((option, optIdx) => {
                                                        const isSelected = selectedOption === option;
                                                        const isCorrectOpt = isAnswered && option.charAt(0).toUpperCase() === result.correctAnswer;
                                                        const isWrongOpt = isAnswered && isSelected && !result.isCorrect;

                                                        let optClass = "border border-old-border bg-white text-old-ink hover:border-muted-gold hover:bg-muted-gold/5";
                                                        if (isAnswered) {
                                                            if (isCorrectOpt) optClass = "border-hunter-green bg-hunter-green/10 text-hunter-green font-medium";
                                                            else if (isWrongOpt) optClass = "border-red-500 bg-red-50 text-red-700 font-medium";
                                                            else optClass = "border-old-border/50 bg-gray-50 text-old-ink/50 select-none";
                                                        } else if (isSelected) {
                                                            optClass = "border-muted-gold bg-muted-gold/10 text-old-ink";
                                                        }

                                                        return (
                                                            <button
                                                                key={optIdx}
                                                                onClick={() => !isAnswered && handleSelectOption(index, option)}
                                                                disabled={isAnswered}
                                                                className={`w-full text-left px-4 py-3 rounded-sm transition-all flex items-start space-x-3 ${optClass}`}
                                                            >
                                                                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold
                                  ${isAnswered && isCorrectOpt ? 'bg-hunter-green text-white' :
                                                                        isAnswered && isWrongOpt ? 'bg-red-500 text-white' :
                                                                            isSelected ? 'bg-muted-gold text-white' : 'bg-cream-bg border border-old-border text-old-ink/70'}`}
                                                                >
                                                                    {option.charAt(0)}
                                                                </span>
                                                                <MathText className="flex-1 mt-0.5">{option.substring(3)}</MathText>

                                                                {isAnswered && isCorrectOpt && <CheckCircle2 className="w-5 h-5 text-hunter-green" />}
                                                                {isAnswered && isWrongOpt && <XCircle className="w-5 h-5 text-red-500" />}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </CardContent>

                                            <CardFooter className="bg-cream-card/30 border-t border-old-border/50 px-6 py-4">
                                                {!isAnswered ? (
                                                    <div className="w-full flex justify-between items-center">
                                                        <span className="text-sm text-old-ink/50">Select an option to answer</span>
                                                        <Button
                                                            onClick={() => handleSubmit(index)}
                                                            disabled={!selectedOption}
                                                            className="bg-hunter-green hover:bg-hunter-green/90 text-white"
                                                        >
                                                            Submit Answer
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <div className="w-full space-y-4">
                                                        <div className="flex items-center justify-between text-sm mb-4">
                                                            <span className="font-medium flex items-center gap-2">
                                                                {result.isCorrect ? (
                                                                    <span className="text-hunter-green flex items-center"><CheckCircle2 className="w-4 h-4 mr-1" /> Correct</span>
                                                                ) : (
                                                                    <span className="text-red-500 flex items-center"><XCircle className="w-4 h-4 mr-1" /> Incorrect</span>
                                                                )}
                                                            </span>
                                                            <span className="text-old-ink/70 bg-white px-2 py-1 rounded border border-old-border shadow-sm">
                                                                Time taken: <span className="font-mono font-medium">{result.timeTaken}s</span>
                                                            </span>
                                                        </div>

                                                        <div className="bg-white p-4 rounded-sm border border-old-border">
                                                            <h5 className="font-medium text-hunter-green mb-2 text-sm uppercase tracking-wider">Explanation</h5>
                                                            <MathText className="text-sm text-old-ink leading-relaxed">{result.explanation}</MathText>
                                                        </div>

                                                    </div>
                                                )}
                                            </CardFooter>
                                        </Card>
                                    );
                                })}
                            </div>

                            {/* Add More Questions Button */}
                            {isComplete && !showConfigForm && (
                                <div className="flex justify-center pt-4">
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowConfigForm(true)}
                                        className="border-muted-gold text-hunter-green hover:bg-muted-gold/10"
                                    >
                                        <Plus className="w-4 h-4 mr-2" />
                                        Add More Questions to this Batch
                                    </Button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </Card>
    );
}
