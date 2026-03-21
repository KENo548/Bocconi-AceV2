import React, { useState, useEffect } from 'react';
import { MockQuestion, QuestionUnit, TagReviewStatus } from '../../services/supabase';
import {
  loadUnitsForFolder, updateQuestionUnits,
  markQuestionReviewed, loadTagReviewProgress, getTagReviewStats,
} from '../../services/supabase';
import { TAXONOMY, getTaxonomySlice, getAllUnitsForTopic } from '../../lib/taxonomy';
import { generateEmbedding } from '../../services/gemini';
import { saveEmbedding } from '../../services/supabase';
import { MathText } from '../../lib/constants';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, ChevronDown, ChevronUp, Loader2, Tag } from 'lucide-react';
 
interface Props {
  folderId: string;
  questions: MockQuestion[];
  onAllReviewed: () => void; // called when all questions approved
}
 
export default function TagReviewPanel({ folderId, questions, onAllReviewed }: Props) {
  const [unitMap, setUnitMap] = useState<Record<string, QuestionUnit[]>>({});
  const [reviewProgress, setReviewProgress] = useState<Record<string, TagReviewStatus>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUnits, setEditUnits] = useState<string[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, pending: 0, reviewed: 0 });
  const [embeddingProgress, setEmbeddingProgress] = useState('');
 
  useEffect(() => {
    loadUnitsForFolder(folderId).then(setUnitMap);
    loadTagReviewProgress(folderId).then(setReviewProgress);
    getTagReviewStats(folderId).then(setStats);
  }, [folderId]);
 
  const handleApprove = async (q: MockQuestion) => {
    setSavingId(q.id);
    try {
      // Generate embedding and save it
      setEmbeddingProgress(`Generating embedding for question...`);
      const embText = `${q.topic} ${q.subtopic} ${q.question} ${q.explanation}`;
      const embedding = await generateEmbedding(embText);
      if (embedding.length > 0) await saveEmbedding(q.id, embedding);
 
      await markQuestionReviewed(folderId, q.id, 'approved');
      setReviewProgress(prev => ({
        ...prev,
        [q.id]: { question_id: q.id, status: 'approved', reviewed_at: new Date().toISOString() },
      }));
      const newStats = await getTagReviewStats(folderId);
      setStats(newStats);
      if (newStats.pending === 0) onAllReviewed();
      setEmbeddingProgress('');
    } finally {
      setSavingId(null);
    }
  };
 
  const handleSaveEdit = async (q: MockQuestion) => {
    setSavingId(q.id);
    try {
      const slice = getTaxonomySlice(q.topic);
      const newUnits = editUnits.map(unit => {
        const subtopic = slice?.subtopics.find(s => s.units.includes(unit))?.name ?? q.subtopic;
        return { subtopic, unit };
      });
      await updateQuestionUnits(q.id, newUnits);
      setUnitMap(prev => ({
        ...prev,
        [q.id]: newUnits.map(u => ({
          id: '', question_id: q.id,
          subtopic: u.subtopic, unit: u.unit,
          review_status: 'corrected' as const,
        })),
      }));
 
      // Generate embedding with corrected units included
      const embText = `${q.topic} ${editUnits.join(' ')} ${q.question} ${q.explanation}`;
      const embedding = await generateEmbedding(embText);
      if (embedding.length > 0) await saveEmbedding(q.id, embedding);
 
      await markQuestionReviewed(folderId, q.id, 'corrected');
      setReviewProgress(prev => ({
        ...prev,
        [q.id]: { question_id: q.id, status: 'corrected', reviewed_at: new Date().toISOString() },
      }));
      setEditingId(null);
      const newStats = await getTagReviewStats(folderId);
      setStats(newStats);
      if (newStats.pending === 0) onAllReviewed();
    } finally {
      setSavingId(null);
    }
  };
 
  const pendingQuestions = questions.filter(q => reviewProgress[q.id]?.status === 'pending' || !reviewProgress[q.id]);
  const reviewedQuestions = questions.filter(q => reviewProgress[q.id]?.status && reviewProgress[q.id].status !== 'pending');
 
  return (
    <div className='space-y-6'>
      {/* Progress bar */}
      <Card className='border-old-border shadow-sm'>
        <CardContent className='pt-6'>
          <div className='flex items-center justify-between mb-3'>
            <div>
              <h3 className='font-serif font-bold text-hunter-green'>
                Tag Review — {stats.reviewed} / {stats.total} reviewed
              </h3>
              <p className='text-sm text-old-ink/60 mt-1'>
                Review and correct the AI-assigned taxonomy tags for each question.
                Embeddings are generated automatically on approval.
              </p>
            </div>
            <span className='text-2xl font-bold text-hunter-green'>
              {stats.total > 0 ? Math.round((stats.reviewed/stats.total)*100) : 0}%
            </span>
          </div>
          <div className='w-full bg-old-border/30 rounded-full h-2'>
            <div
              className='bg-hunter-green h-2 rounded-full transition-all duration-500'
              style={{ width: `${stats.total > 0 ? (stats.reviewed/stats.total)*100 : 0}%` }}
            />
          </div>
          {embeddingProgress && (
            <p className='text-xs text-muted-gold mt-2 flex items-center gap-1'>
              <Loader2 className='w-3 h-3 animate-spin' />
              {embeddingProgress}
            </p>
          )}
        </CardContent>
      </Card>
 
      {/* Pending questions */}
      {pendingQuestions.map(q => {
        const units = unitMap[q.id] ?? [];
        const allTopicUnits = getAllUnitsForTopic(q.topic);
        const isExpanded = expandedId === q.id;
        const isEditing = editingId === q.id;
        const isSaving = savingId === q.id;
 
        return (
          <Card key={q.id} className='border-old-border shadow-sm overflow-hidden'>
            <div
              className='px-5 py-4 flex items-start justify-between cursor-pointer
                hover:bg-cream-bg/50 transition-colors'
              onClick={() => setExpandedId(isExpanded ? null : q.id)}
            >
              <div className='flex-1 min-w-0'>
                <div className='flex items-center gap-2 mb-2 flex-wrap'>
                  <span className='text-xs font-bold uppercase tracking-wider
                    bg-muted-gold/15 text-muted-gold px-2 py-0.5 rounded-sm'>
                    {q.topic}
                  </span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm ${
                    q.difficulty==='Hard'?'bg-red-100 text-red-700':
                    q.difficulty==='Medium'?'bg-amber-100 text-amber-700':
                    'bg-green-100 text-green-700'
                  }`}>{q.difficulty}</span>
                  {units.map(u => (
                    <span key={u.unit} className='text-xs bg-blue-50 text-blue-700
                      px-2 py-0.5 rounded-sm flex items-center gap-1'>
                      <Tag className='w-2.5 h-2.5' />{u.unit}
                    </span>
                  ))}
                  {units.length === 0 && (
                    <span className='text-xs text-old-ink/40 italic'>no units tagged</span>
                  )}
                </div>
                <MathText className='text-sm text-old-ink/80 line-clamp-2'>
                  {q.question}
                </MathText>
              </div>
              <div className='flex items-center gap-2 shrink-0 ml-4'>
                {isExpanded ? <ChevronUp className='w-4 h-4' /> : <ChevronDown className='w-4 h-4' />}
              </div>
            </div>
 
            {isExpanded && (
              <div className='px-5 pb-5 border-t border-old-border/30 pt-4 space-y-4'>
                <MathText className='text-sm text-old-ink/80 bg-cream-bg p-3 rounded-sm border border-old-border'>
                  {q.question}
                </MathText>
 
                {isEditing ? (
                  <div className='space-y-3'>
                    <p className='text-xs font-semibold text-old-ink/60 uppercase tracking-wider'>
                      Select units (max 3):
                    </p>
                    <div className='grid grid-cols-2 gap-2 max-h-64 overflow-y-auto'>
                      {allTopicUnits.map(unit => (
                        <label key={unit}
                          className='flex items-start gap-2 text-sm cursor-pointer
                            p-2 rounded-sm hover:bg-cream-bg border border-transparent
                            hover:border-old-border/50'>
                          <input
                            type='checkbox'
                            checked={editUnits.includes(unit)}
                            disabled={!editUnits.includes(unit) && editUnits.length >= 3}
                            onChange={e => {
                              if (e.target.checked) {
                                setEditUnits(prev => [...prev, unit].slice(0,3));
                              } else {
                                setEditUnits(prev => prev.filter(u => u !== unit));
                              }
                            }}
                            className='mt-0.5'
                          />
                          <span className='leading-snug'>{unit}</span>
                        </label>
                      ))}
                    </div>
                    <div className='flex gap-2'>
                      <Button
                        onClick={() => handleSaveEdit(q)}
                        disabled={isSaving || editUnits.length === 0}
                        className='bg-hunter-green text-white hover:bg-hunter-green/90'
                        size='sm'
                      >
                        {isSaving
                          ? <><Loader2 className='w-3 h-3 mr-1 animate-spin'/>Saving...</>
                          : 'Save Corrections'}
                      </Button>
                      <Button variant='outline' size='sm'
                        onClick={() => setEditingId(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div className='flex gap-2'>
                    <Button
                      onClick={() => handleApprove(q)}
                      disabled={isSaving}
                      className='bg-hunter-green text-white hover:bg-hunter-green/90'
                      size='sm'
                    >
                      {isSaving
                        ? <><Loader2 className='w-3 h-3 mr-1 animate-spin'/>Processing...</>
                        : <><Check className='w-3 h-3 mr-1'/>Approve Tags</>}
                    </Button>
                    <Button
                      variant='outline' size='sm'
                      onClick={() => {
                        setEditUnits(units.map(u => u.unit));
                        setEditingId(q.id);
                      }}
                    >
                      Edit Tags
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
 
      {/* Reviewed count summary */}
      {reviewedQuestions.length > 0 && (
        <p className='text-sm text-old-ink/50 text-center'>
          {reviewedQuestions.length} question{reviewedQuestions.length!==1?'s':''} reviewed ✓
        </p>
      )}
    </div>
  );
}