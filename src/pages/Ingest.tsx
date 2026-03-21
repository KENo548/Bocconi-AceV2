import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { useStore } from '../store/useStore';
import { analyseTopicProfile, ingestMockTest, synthesizeStylePattern, tagQuestionUnits } from '../services/gemini';
import TagReviewPanel from '../components/ingest/TagReviewPanel';
import ProfileReviewPanel from '../components/ingest/ProfileReviewPanel';
import {
    createIngestFolder,
    initTagReview,
    insertMockQuestions,
    insertQuestionUnits,
    getTagReviewStats,
    IngestFolder,
    loadAllPendingDrafts,
    loadIngestFolders,
    loadPendingDrafts,
    loadUnitsForFolder,
    loadQuestionsForFolder,
    ProfileDraft,
    saveProfileDraft,
} from '../services/supabase';

export default function Ingest() {
    const { mockQuestions, addMockQuestions, clearMockQuestions } = useStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [folderId, setFolderId] = useState<string | null>(null);
    const [pipelineStage, setPipelineStage] = useState<'idle' | 'extracting' | 'tagging' | 'review' | 'profiling' | 'done'>('idle');
    const [pipelineMsg, setPipelineMsg] = useState<string>('');
    const [dbQuestions, setDbQuestions] = useState<any[]>([]);
    const [folders, setFolders] = useState<IngestFolder[]>([]);
    const [activeReviewFolderId, setActiveReviewFolderId] = useState<string | null>(null);
    const [pendingDrafts, setPendingDrafts] = useState<ProfileDraft[]>([]);
    const [showProfileReview, setShowProfileReview] = useState(false);
    const [analysisProgress, setAnalysisProgress] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const toGeneratedQuestion = (dbQ: any) => ({
        topic: dbQ.topic,
        subtopic: dbQ.subtopic,
        question: dbQ.question,
        options: dbQ.options,
        correctAnswer: dbQ.correct_answer,
        explanation: dbQ.explanation,
        chartData: dbQ.chart_data ?? null,
        difficulty: dbQ.difficulty,
        styleAnalysis: dbQ.style_analysis,
        syllabusAlignment: dbQ.syllabus_alignment,
        source: dbQ.source,
    });

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const alreadyIngested = mockQuestions.some(q => q.source === file.name);
        if (alreadyIngested) {
            if (!window.confirm(`${file.name} has already been ingested. Upload again and merge?`)) {
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }
        }

        setError(null);
        setSuccess(null);
        setLoading(true);
        setPipelineStage('extracting');
        setPipelineMsg('');
        setFolderId(null);
        setDbQuestions([]);

        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const base64String = (event.target?.result as string).split(',')[1];
                    const questions = await ingestMockTest(base64String, file.type, file.name);
                    // NEW pipeline stages: folder → unit tagging → tag review → profile analysis trigger
                    setPipelineStage('tagging');
                    setPipelineMsg('Creating ingestion folder...');
                    const folder = await createIngestFolder(file.name);
                    setFolderId(folder.id);
                    // refresh folders list so Step 7 resume logic can find this folder later
                    loadIngestFolders().then(setFolders).catch(() => {});

                    setPipelineMsg('Saving extracted questions...');
                    const rows = questions.map((q) => ({
                        id: crypto.randomUUID(),
                        folder_id: folder.id,
                        topic: q.topic,
                        subtopic: q.subtopic,
                        difficulty: (q.difficulty ?? 'Medium') as 'Easy' | 'Medium' | 'Hard',
                        question: q.question,
                        options: q.options,
                        correct_answer: q.correctAnswer,
                        explanation: q.explanation,
                        chart_data: q.chartData ?? null,
                        style_analysis: q.styleAnalysis ?? '',
                        syllabus_alignment: q.syllabusAlignment ?? '',
                        source: q.source ?? file.name,
                    }));
                    const inserted = await insertMockQuestions(rows);
                    setDbQuestions(inserted);

                    // Integration pattern: init review + tag each question, then show review UI
                    setPipelineMsg('Initialising tag review...');
                    const allInsertedQuestions = await loadQuestionsForFolder(folder.id);
                    await initTagReview(folder.id, allInsertedQuestions.map((q: any) => q.id));

                    let taggedCount = 0;
                    for (const dbQ of allInsertedQuestions) {
                        const tags = await tagQuestionUnits(toGeneratedQuestion(dbQ));
                        if (tags.length > 0) {
                            await insertQuestionUnits(dbQ.id, tags.map(t => ({ subtopic: t.subtopic, unit: t.unit })));
                        }
                        taggedCount++;
                        setPipelineMsg(`Tagged ${taggedCount}/${allInsertedQuestions.length} questions...`);
                    }

                    setPipelineStage('review');
                    setPipelineMsg('');
                    setActiveReviewFolderId(folder.id);

                    // Keep the existing learned-style synthesis (upload UI unchanged)
                    const allQuestions = [...mockQuestions, ...questions];
                    addMockQuestions(questions);

                    setSuccess(`Successfully ingested ${questions.length} questions from ${file.name}`);
                } catch (err: any) {
                    setError(err.message || "Failed to process the document.");
                    setPipelineStage('idle');
                    setPipelineMsg('');
                } finally {
                    setLoading(false);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                }
            };
            reader.onerror = () => {
                setError("Failed to read the file");
                setLoading(false);
            };
            reader.readAsDataURL(file);
        } catch (err: any) {
            setError(err.message || "An unexpected error occurred.");
            setLoading(false);
            setPipelineStage('idle');
            setPipelineMsg('');
        }
    };

    const refreshFolders = async () => {
        try {
            setFolders(await loadIngestFolders());
        } catch {
            // ignore; UI can still function without folder list
        }
    };

    // Step 7 — Resume pending reviews on app load
    useEffect(() => {
        refreshFolders();
    }, []);

    useEffect(() => {
        // Check for any folders with pending tag reviews
        const checkPendingReviews = async () => {
            for (const folder of folders) {
                const stats = await getTagReviewStats(folder.id);
                if (stats.pending > 0) {
                    setActiveReviewFolderId(folder.id);
                    setShowProfileReview(false);
                    setPendingDrafts([]);
                    return; // Show the first folder with pending work
                }
            }
            // No pending tag reviews — check for pending profile drafts
            const drafts = await loadAllPendingDrafts();
            if (drafts.length > 0) {
                setPendingDrafts(drafts);
                setShowProfileReview(true);
            }
        };
        if (folders.length > 0) checkPendingReviews();
    }, [folders]);

    const reviewQuestions = useMemo(() => {
        // Use DB-backed questions if available (needed for Supabase persisted review)
        return dbQuestions.length > 0 ? dbQuestions : mockQuestions;
    }, [dbQuestions, mockQuestions]);

    const handleAllTagsReviewed = async () => {
        if (!activeReviewFolderId) return;
        setPipelineStage('profiling');
        setAnalysisProgress('All tags reviewed. Running pattern analysis per topic...');
        try {
            const questionsInFolder = await loadQuestionsForFolder(activeReviewFolderId);
            const unitsByQuestion = await loadUnitsForFolder(activeReviewFolderId);

            const byTopic: Record<string, any[]> = {};
            questionsInFolder.forEach((q: any) => {
                if (!byTopic[q.topic]) byTopic[q.topic] = [];
                byTopic[q.topic].push(q);
            });

            const newDrafts: ProfileDraft[] = [];
            const topics = Object.keys(byTopic);
            for (let i = 0; i < topics.length; i++) {
                const topic = topics[i];
                setAnalysisProgress(`Analysing ${topic} (${i + 1}/${topics.length})...`);
                const topicQs = byTopic[topic];
                const analysis = await analyseTopicProfile(topic, topicQs.map((q: any) => ({
                        id: q.id,
                        question: toGeneratedQuestion(q),
                        units: (unitsByQuestion[q.id] ?? []).map((u: any) => ({ subtopic: u.subtopic, unit: u.unit })),
                    })));

                const draft = await saveProfileDraft({
                    topic: analysis.topic,
                    folder_id: activeReviewFolderId,
                    coverage_map: analysis.coverage_map as any,
                    difficulty_ladder: analysis.difficulty_ladder,
                    distractor_taxonomy: analysis.distractor_taxonomy,
                    time_pressure: analysis.time_pressure,
                    calibrated_uplift: analysis.calibrated_uplift,
                    figure_patterns: analysis.figure_patterns,
                    prose_injection: analysis.prose_injection,
                    representative_q_ids: analysis.representative_q_ids as any,
                    question_count: analysis.question_count,
                    diff_from_approved: null,
                    status: 'pending',
                } as any);
                newDrafts.push(draft);
            }

            setPipelineStage('done');
            setAnalysisProgress('');
            const drafts = newDrafts.length > 0 ? newDrafts : await loadPendingDrafts(activeReviewFolderId);
            setPendingDrafts(drafts);
            setShowProfileReview(true);
            setSuccess('Draft topic profiles generated. Please review and approve each topic.');
        } catch (e: any) {
            setError(e?.message || 'Profile analysis failed.');
            setPipelineStage('review');
            setAnalysisProgress('');
        }
    };

    return (
        <div className="max-w-4xl mx-auto space-y-8">
            <Card className="bg-cream-card border-old-border shadow-sm">
                <CardHeader className="pb-4 border-b border-old-border/50">
                    <div className="flex items-center space-x-3">
                        <Database className="w-8 h-8 text-muted-gold" />
                        <div>
                            <CardTitle className="text-2xl font-serif">Ingest Mock Tests</CardTitle>
                            <CardDescription>
                                Upload official Bocconi mock tests (PDFs) to build your personal question bank.
                                The AI will extract the questions, math equations, charts, and correct answers automatically.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="pt-8 space-y-6">
                    <div className="flex flex-col items-center justify-center p-12 border-2 border-dashed border-old-border/60 rounded-sm bg-cream-bg/50 hover:bg-cream-bg transition-colors">
                        {loading ? (
                            <div className="flex flex-col items-center space-y-4">
                                <Loader2 className="w-12 h-12 text-muted-gold animate-spin" />
                                <p className="text-old-ink/70 font-medium">Extracting questions using Gemini 2.0...</p>
                                <p className="text-sm text-old-ink/50">This may take up to a minute depending on the document length.</p>
                            </div>
                        ) : (
                            <>
                                <Upload className="w-12 h-12 text-hunter-green/50 mb-4" />
                                <p className="text-lg font-serif font-medium text-old-ink mb-2">Upload a Mock Test PDF</p>
                                <p className="text-sm text-old-ink/60 mb-6 text-center max-w-sm">
                                    Must be a PDF file containing the mock test questions. Text-selectable PDFs work best.
                                </p>
                                <input
                                    type="file"
                                    accept="application/pdf"
                                    className="hidden"
                                    ref={fileInputRef}
                                    onChange={handleFileUpload}
                                />
                                <Button onClick={() => fileInputRef.current?.click()} size="lg" className="bg-hunter-green hover:bg-hunter-green/90 text-white">
                                    Select File
                                </Button>
                            </>
                        )}
                    </div>

                    {error && (
                        <div className="p-4 bg-burgundy/10 border border-burgundy/20 rounded-sm flex items-start space-x-3">
                            <AlertCircle className="w-5 h-5 text-burgundy shrink-0 mt-0.5" />
                            <div className="text-sm text-burgundy/90">
                                <span className="font-semibold">Error ingesting file: </span>
                                {error}
                            </div>
                        </div>
                    )}

                    {success && (
                        <div className="p-4 bg-olive/10 border border-olive/20 rounded-sm flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <CheckCircle2 className="w-5 h-5 text-olive shrink-0" />
                                <span className="text-sm font-medium text-olive/90">{success}</span>
                            </div>
                        </div>
                    )}

                    {pipelineMsg && (
                        <div className="p-4 bg-cream-bg border border-old-border rounded-sm flex items-center justify-between">
                            <div className="flex items-center space-x-3">
                                <Loader2 className="w-5 h-5 text-muted-gold shrink-0 animate-spin" />
                                <span className="text-sm font-medium text-old-ink/80">{pipelineMsg}</span>
                            </div>
                        </div>
                    )}

                </CardContent>
            </Card>

            {activeReviewFolderId && !showProfileReview && (
                <div className='mt-8 space-y-4'>
                    <h2 className='text-2xl font-serif font-bold text-hunter-green'>
                        Step 2 — Review Question Tags
                    </h2>
                    <p className='text-old-ink/60'>
                        The AI has tagged each question with taxonomy units.
                        Review and correct any wrong tags, then approve.
                        This data is saved — you can close the tab and return.
                    </p>
                    {analysisProgress ? (
                        <div className='flex items-center gap-3 p-4 bg-cream-bg rounded-sm border border-old-border'>
                            <Loader2 className='w-5 h-5 text-muted-gold animate-spin'/>
                            <p className='text-sm text-old-ink/70'>{analysisProgress}</p>
                        </div>
                    ) : (
                        <TagReviewPanel
                            folderId={activeReviewFolderId}
                            questions={reviewQuestions as any}
                            onAllReviewed={handleAllTagsReviewed}
                        />
                    )}
                </div>
            )}

            {showProfileReview && pendingDrafts.length > 0 && (
                <div className='mt-8 space-y-4'>
                    <h2 className='text-2xl font-serif font-bold text-hunter-green'>
                        Step 3 — Review Pattern Profiles
                    </h2>
                    <p className='text-old-ink/60'>
                        Gemini 2.5 Pro has analysed your questions and produced pattern profiles.
                        Review, edit, and approve each topic. Approved profiles will be used
                        in all future question generation for that topic.
                    </p>
                    <ProfileReviewPanel
                        drafts={pendingDrafts}
                        onAllDecided={async () => {
                            setShowProfileReview(false);
                            setActiveReviewFolderId(null);
                            setPendingDrafts(await loadAllPendingDrafts().catch(() => []));
                            refreshFolders();
                        }}
                    />
                </div>
            )}

            {mockQuestions.length > 0 && (
                <Card className="bg-cream-card border-old-border shadow-sm">
                    <CardHeader className="pb-4 border-b border-old-border/50 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-xl font-serif">Your Question Bank</CardTitle>
                            <CardDescription>
                                You currently have {mockQuestions.length} extracted mock test questions available.
                            </CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={clearMockQuestions} className="text-burgundy border-burgundy/20 hover:bg-burgundy/5">
                            Clear All Questions
                        </Button>
                    </CardHeader>
                    <CardContent className="pt-6">
                        <div className="bg-cream-bg rounded-sm border border-old-border overflow-hidden">
                            <div className="max-h-96 overflow-y-auto">
                                {mockQuestions.map((q, i) => (
                                    <div key={`${q.source}-${q.subtopic}-${i}`} className="p-4 border-b border-old-border/50 last:border-0 hover:bg-white/50 transition-colors">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold bg-muted-gold/20 text-muted-gold px-2 py-1 rounded-sm uppercase tracking-wider">
                                                {q.topic}
                                            </span>
                                            {q.source && (
                                                <span className="text-xs text-old-ink/50 flex items-center">
                                                    <FileText className="w-3 h-3 mr-1" />
                                                    {q.source}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-old-ink/80 line-clamp-2">{q.question}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
