import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { generateQuestions, GeneratedQuestion, QuestionRequest } from '../services/groq';
import { useStore, QuestionConfig } from '../store/useStore';
import { Loader2, Plus, Trash2, Check, X, FileText, Save, BrainCircuit, AlertCircle, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import PaperSection from '../components/PaperSection';
import { SYLLABUS, MathText } from '../lib/constants';
import QuestionFigure from '../components/QuestionFigure';
export default function PaperBuilder() {
  const { addPaper, mockQuestions, paperBuilderState, setPaperBuilderState } = useStore();

  const { configs, generatedQuestions, acceptedQuestions, paperName } = paperBuilderState;

  const setConfigs = (action: React.SetStateAction<QuestionConfig[]>) => {
    setPaperBuilderState(prev => ({ ...prev, configs: typeof action === 'function' ? action(prev.configs) : action }));
  };
  const setGeneratedQuestions = (action: React.SetStateAction<(GeneratedQuestion & { id: string })[]>) => {
    setPaperBuilderState(prev => ({ ...prev, generatedQuestions: typeof action === 'function' ? action(prev.generatedQuestions) : action }));
  };
  const setAcceptedQuestions = (action: React.SetStateAction<GeneratedQuestion[]>) => {
    setPaperBuilderState(prev => ({ ...prev, acceptedQuestions: typeof action === 'function' ? action(prev.acceptedQuestions) : action }));
  };
  const setPaperName = (name: string) => {
    setPaperBuilderState(prev => ({ ...prev, paperName: name }));
  };

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error', msg: string } | null>(null);

  const handleAddConfig = () => {
    setConfigs([...configs, { id: crypto.randomUUID(), topic: "Algebra", difficulty: "Medium", source: "AI" }]);
  };

  const handleRemoveConfig = (id: string) => {
    if (configs.length > 1) {
      setConfigs(configs.filter(c => c.id !== id));
    }
  };

  const handleUpdateConfig = (id: string, field: keyof QuestionConfig, value: string) => {
    setConfigs(configs.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleGenerate = async () => {
    setFeedback(null);
    setLoading(true);
    try {
      const finalQuestions = configs.map(config => {
        if (config.source === 'Mock') {
          const matching = mockQuestions.filter(mq => mq.topic === config.topic);
          if (matching.length > 0) {
            return matching[Math.floor(Math.random() * matching.length)];
          }
        }
        return null;
      });
      const mockFallbacks = configs.filter((cfg, i) =>
        cfg.source === 'Mock' && finalQuestions[i] === null
      );

      if (mockFallbacks.length > 0) {
        const topicList = mockFallbacks.map(c => c.topic).join(', ');
        setFeedback({ type: 'error', msg: `No mock questions found for: ${topicList}. Falling back to AI generation.` });
      }

      const aiConfigs = configs.filter((_, i) => finalQuestions[i] === null);
      let aiQs: GeneratedQuestion[] = [];

      if (aiConfigs.length > 0) {
        // New groq.ts handles Supabase profile + example fetching internally
        aiQs = await generateQuestions(aiConfigs);
      }

      let aiIndex = 0;
      const qs = finalQuestions
        .map(q => q === null ? aiQs[aiIndex++] : q)
        .filter((q): q is GeneratedQuestion => q !== null && q !== undefined);

      // Ensure unique IDs and append to existing questions
      setGeneratedQuestions(prev => [...prev, ...qs.map(q => ({ ...q, id: crypto.randomUUID() }))]);
    } catch (error) {
      const errStr = String(error);
      const isQuota = errStr.includes('429') || errStr.includes('quota') || errStr.includes('RESOURCE_EXHAUSTED') || errStr.includes('All models quota');
      console.error("Failed to generate questions", error);
      setFeedback({
        type: 'error', msg: isQuota
          ? "API quota exceeded — all models are rate-limited. Please wait 30–60 seconds and try again."
          : "Failed to generate questions. Please try again."
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = (id: string) => {
    const q = generatedQuestions.find(q => q.id === id);
    if (q) {
      setAcceptedQuestions([...acceptedQuestions, q]);
      setGeneratedQuestions(generatedQuestions.filter(q => q.id !== id));
    }
  };

  const handleReject = (id: string) => {
    setGeneratedQuestions(generatedQuestions.filter(q => q.id !== id));
  };

  const handleSavePaper = () => {
    if (!paperName.trim()) {
      setFeedback({ type: 'error', msg: "Please enter a name for the paper." });
      return;
    }
    if (acceptedQuestions.length === 0) {
      setFeedback({ type: 'error', msg: "The paper is empty." });
      return;
    }
    addPaper({
      id: crypto.randomUUID(),
      name: paperName,
      createdAt: Date.now(),
      questions: acceptedQuestions
    });
    setFeedback({ type: 'success', msg: "Paper saved successfully!" });
    setPaperName("");
    setAcceptedQuestions([]);
  };

  return (
    <div className="w-full max-w-[1920px] mx-auto space-y-8 px-4 sm:px-8">
      {feedback && (
        <div className={`p-4 rounded-sm flex items-start space-x-3 border ${feedback.type === 'error' ? 'bg-burgundy/10 border-burgundy/20 text-burgundy/90' : 'bg-olive/10 border-olive/20 text-olive/90'}`}>
          {feedback.type === 'error' ? (
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
          ) : (
            <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
          )}
          <div className="text-sm font-medium">
            {feedback.msg}
          </div>
        </div>
      )}

      <Card className="bg-cream-card border-old-border shadow-sm">
        <CardHeader className="pb-4 border-b border-old-border/50">
          <div className="flex items-center space-x-3">
            <FileText className="w-8 h-8 text-muted-gold mt-1" />
            <div className="flex-1">
              <div className="flex justify-between items-center w-full">
                <CardTitle className="text-2xl font-serif">Paper Builder</CardTitle>
                <input
                  type="text"
                  value={paperName}
                  onChange={(e) => setPaperName(e.target.value)}
                  placeholder="Enter custom paper name..."
                  className="bg-white border border-old-border rounded-sm px-4 py-1.5 text-sm font-medium focus:outline-none focus:border-muted-gold focus:ring-1 focus:ring-muted-gold text-old-ink w-64"
                />
              </div>
              <CardDescription className="mt-1">
                Configure, generate, and curate your own custom practice papers.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <AnimatePresence>
            {configs.map((config, index) => (
              <motion.div
                key={config.id}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center space-x-4 bg-cream-bg p-4 rounded-sm border border-old-border"
              >
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-old-ink/70 uppercase tracking-wider">Topic</label>
                    <select
                      value={config.topic}
                      onChange={(e) => handleUpdateConfig(config.id, 'topic', e.target.value)}
                      className="w-full bg-white border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold focus:ring-1 focus:ring-muted-gold text-old-ink"
                    >
                      {SYLLABUS.map((subject) => (
                        <optgroup key={subject.subject} label={subject.subject}>
                          {subject.topics.map((topic) => (
                            <option key={topic} value={topic}>{topic}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-old-ink/70 uppercase tracking-wider">Difficulty</label>
                    <select
                      value={config.difficulty}
                      onChange={(e) => handleUpdateConfig(config.id, 'difficulty', e.target.value)}
                      className="w-full bg-white border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold focus:ring-1 focus:ring-muted-gold text-old-ink"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                  <div className="space-y-1.5 pt-2 sm:pt-0">
                    <label className="text-xs font-medium text-old-ink/70 uppercase tracking-wider">Source</label>
                    <select
                      value={config.source || 'AI'}
                      onChange={(e) => handleUpdateConfig(config.id, 'source', e.target.value)}
                      className="w-full bg-white border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold focus:ring-1 focus:ring-muted-gold text-old-ink"
                    >
                      <option value="AI">AI Generated</option>
                      <option value="Mock">Mock Test</option>
                    </select>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveConfig(config.id)}
                  disabled={configs.length === 1}
                  className="mt-6 p-2 text-old-ink/40 hover:text-burgundy disabled:opacity-30 transition-colors shrink-0"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          <Button variant="outline" onClick={handleAddConfig} className="w-full border-dashed">
            <Plus className="w-4 h-4 mr-2" />
            Add New Question
          </Button>
        </CardContent>
        <CardFooter className="bg-cream-bg rounded-b-sm border-t border-old-border pt-6">
          <Button size="lg" onClick={handleGenerate} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Questions...
              </>
            ) : (
              "Generate Questions"
            )}
          </Button>
        </CardFooter>
      </Card>

      {generatedQuestions.length > 0 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-old-border pb-4">
            <h3 className="text-xl font-serif font-semibold text-old-ink">Generated Questions</h3>
            <span className="text-sm text-old-ink/70">{generatedQuestions.length} pending review</span>
          </div>

          <AnimatePresence>
            {generatedQuestions.map((question) => (
              <motion.div
                key={question.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
              >
                <Card className="border-old-border">
                  <CardHeader className="pb-4 bg-cream-bg/50">
                    <div className="flex items-center justify-between">
                      <CardDescription className="font-serif font-medium text-muted-gold uppercase tracking-wider text-xs">
                        {question.topic} • {question.subtopic}
                      </CardDescription>
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline" className="text-burgundy hover:bg-burgundy/10 hover:text-burgundy border-burgundy/20" onClick={() => handleReject(question.id)}>
                          <X className="w-4 h-4 mr-1" /> Reject
                        </Button>
                        <Button size="sm" className="bg-olive hover:bg-olive/90 text-white" onClick={() => handleAccept(question.id)}>
                          <Check className="w-4 h-4 mr-1" /> Accept
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-4 space-y-4">
                    <div className="text-old-ink font-sans max-w-none">
                      <MathText>{question.question}</MathText>
                    </div>
                    {question.chartData && (
                      <div className="bg-white p-4 border border-old-border/50 rounded-sm">
                        <QuestionFigure chartData={question.chartData} />
                      </div>
                    )}
                    <div className="space-y-2 pl-4 border-l-2 border-old-border/50">
                      {question.options.map((opt, idx) => (
                        <div key={idx} className="font-sans max-w-none text-sm">
                          <MathText>{opt}</MathText>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {acceptedQuestions.length > 0 && (
        <div className="space-y-6 pt-8 border-t-2 border-old-border border-dashed">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-serif font-bold text-old-ink">The Paper</h3>
              <p className="text-old-ink/70">Your curated collection of accepted questions.</p>
            </div>
            <div className="flex items-center space-x-3">
              <Button onClick={() => { setAcceptedQuestions([]); setPaperName(""); }} variant="outline" className="text-burgundy hover:bg-burgundy/10 hover:text-burgundy border-burgundy/20">
                <Trash2 className="w-4 h-4 mr-2" />
                Discard Paper
              </Button>
              <Button onClick={handleSavePaper} className="bg-hunter-green hover:bg-hunter-green/90">
                <Save className="w-4 h-4 mr-2" />
                Save Paper to Repository
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto pb-8">
            <PaperSection questions={acceptedQuestions} paperName={paperName} dateCreated={Date.now()} />
          </div>
        </div>
      )}
    </div>
  );
}
