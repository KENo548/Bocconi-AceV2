import React, { useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Upload, FileText, Loader2, CheckCircle2, AlertCircle, Database } from 'lucide-react';
import { useStore } from '../store/useStore';
import { ingestMockTest, synthesizeStylePattern } from '../services/gemini';

export default function Ingest() {
    const { mockQuestions, addMockQuestions, clearMockQuestions, setLearnedStyleProfile } = useStore();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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

        try {
            // Convert file to base64
            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const base64String = (event.target?.result as string).split(',')[1];
                    const questions = await ingestMockTest(base64String, file.type, file.name);
                    const allQuestions = [...mockQuestions, ...questions];
                    addMockQuestions(questions);

                    const profile = await synthesizeStylePattern(allQuestions);
                    if (profile && profile.trim().length > 0) {
                        setLearnedStyleProfile(profile);
                    } else {
                        console.warn("Style synthesis returned empty — keeping existing profile");
                    }

                    setSuccess(`Successfully ingested ${questions.length} questions from ${file.name}`);
                } catch (err: any) {
                    setError(err.message || "Failed to process the document.");
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

                </CardContent>
            </Card>

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
