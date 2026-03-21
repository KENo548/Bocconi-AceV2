import React, { useState } from 'react';
import { ProfileDraft } from '../../services/supabase';
import { approveProfileDraft, updateDraftStatus } from '../../services/supabase';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Check, X, SkipForward, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
 
interface Props {
  drafts: ProfileDraft[];
  onAllDecided: () => void;
}
 
export default function ProfileReviewPanel({ drafts, onAllDecided }: Props) {
  const [activeDraftId, setActiveDraftId] = useState<string>(drafts[0]?.id ?? '');
  const [edits, setEdits] = useState<Record<string, Record<string,string>>>({});
  const [expandedSection, setExpandedSection] = useState<string | null>('difficulty_ladder');
  const [saving, setSaving] = useState(false);
  const [decided, setDecided] = useState<Set<string>>(new Set());
 
  const activeDraft = drafts.find(d => d.id === activeDraftId);
  const remainingDrafts = drafts.filter(d => !decided.has(d.id));
 
  const getFieldValue = (draft: ProfileDraft, field: string): string => {
    return edits[draft.id]?.[field] ?? (draft as any)[field] ?? '';
  };
 
  const handleEdit = (draftId: string, field: string, value: string) => {
    setEdits(prev => ({
      ...prev,
      [draftId]: { ...(prev[draftId] ?? {}), [field]: value },
    }));
  };
 
  const handleApprove = async (draft: ProfileDraft) => {
    setSaving(true);
    try {
      await approveProfileDraft(draft, edits[draft.id] ?? {});
      const newDecided = new Set([...decided, draft.id]);
      setDecided(newDecided);
      const next = drafts.find(d => !newDecided.has(d.id));
      if (next) setActiveDraftId(next.id);
      else onAllDecided();
    } finally {
      setSaving(false);
    }
  };
 
  const handleSkip = async (draft: ProfileDraft) => {
    await updateDraftStatus(draft.id, 'skipped');
    const newDecided = new Set([...decided, draft.id]);
    setDecided(newDecided);
    const next = drafts.find(d => !newDecided.has(d.id));
    if (next) setActiveDraftId(next.id);
    else onAllDecided();
  };
 
  const handleReject = async (draft: ProfileDraft) => {
    await updateDraftStatus(draft.id, 'rejected');
    const newDecided = new Set([...decided, draft.id]);
    setDecided(newDecided);
    const next = drafts.find(d => !newDecided.has(d.id));
    if (next) setActiveDraftId(next.id);
    else onAllDecided();
  };
 
  if (!activeDraft) return (
    <div className='text-center py-12 text-old-ink/60'>
      All profiles reviewed.
    </div>
  );
 
  const sections = [
    { key: 'difficulty_ladder',   label: 'Difficulty Ladder',   desc: 'What distinguishes Easy/Medium/Hard for this topic specifically.' },
    { key: 'distractor_taxonomy', label: 'Distractor Taxonomy', desc: 'Categories of wrong answers and how they trap students.' },
    { key: 'time_pressure',       label: 'Time Pressure',       desc: 'What makes questions in this topic slow to solve.' },
    { key: 'calibrated_uplift',   label: 'Calibrated Uplift',   desc: 'Specific changes for 10-15% real test difficulty increase.' },
    { key: 'figure_patterns',     label: 'Figure Patterns',     desc: 'Chart/table types, data structures, how questions reference them.' },
    { key: 'prose_injection',     label: 'Generation Prompt',   desc: 'Text injected into every generation call for this topic (max 400 words).' },
  ];
 
  const coverageEntries = Object.entries(activeDraft.coverage_map ?? {});
 
  return (
    <div className='space-y-6'>
      {/* Topic tabs */}
      <div className='flex gap-2 flex-wrap'>
        {remainingDrafts.map(d => (
          <button key={d.id}
            onClick={() => setActiveDraftId(d.id)}
            className={`px-3 py-1.5 rounded-sm text-sm font-medium transition-colors
              ${d.id === activeDraftId
                ? 'bg-hunter-green text-white'
                : 'bg-cream-bg border border-old-border text-old-ink/70 hover:border-muted-gold'
              }`}
          >
            {d.topic}
            <span className='ml-1.5 text-xs opacity-70'>({d.question_count}q)</span>
          </button>
        ))}
      </div>
 
      <Card className='border-old-border shadow-sm'>
        <CardHeader className='border-b border-old-border/50'>
          <div className='flex items-center justify-between'>
            <div>
              <CardTitle className='font-serif text-2xl text-hunter-green'>
                {activeDraft.topic}
              </CardTitle>
              <CardDescription>
                {activeDraft.question_count} questions analysed ·{' '}
                {coverageEntries.length} units observed
              </CardDescription>
            </div>
            <div className='flex gap-2'>
              <Button onClick={() => handleApprove(activeDraft)} disabled={saving}
                className='bg-hunter-green text-white hover:bg-hunter-green/90'>
                {saving ? <Loader2 className='w-4 h-4 animate-spin'/> :
                  <><Check className='w-4 h-4 mr-1'/>Approve &amp; Lock</>}
              </Button>
              <Button variant='outline' onClick={() => handleSkip(activeDraft)}
                className='border-muted-gold text-hunter-green'>
                <SkipForward className='w-4 h-4 mr-1'/>Skip
              </Button>
              <Button variant='outline' onClick={() => handleReject(activeDraft)}
                className='border-red-200 text-red-600'>
                <X className='w-4 h-4 mr-1'/>Reject
              </Button>
            </div>
          </div>
        </CardHeader>
 
        <CardContent className='pt-6 space-y-4'>
          {/* Coverage map */}
          <div className='bg-cream-bg p-4 rounded-sm border border-old-border/50'>
            <h4 className='text-xs font-bold uppercase tracking-wider text-old-ink/60 mb-3'>
              Coverage Map — Units Observed in Data
            </h4>
            <div className='grid grid-cols-2 sm:grid-cols-3 gap-2'>
              {coverageEntries.map(([unit, entry]) => (
                <div key={unit} className='flex items-center gap-1.5 text-xs'>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${
                    entry.confidence==='high'?'bg-green-500':
                    entry.confidence==='medium'?'bg-amber-500':'bg-red-400'
                  }`}/>
                  <span className='truncate' title={unit}>{unit}</span>
                  <span className='text-old-ink/40 shrink-0'>×{entry.count}</span>
                </div>
              ))}
            </div>
            <p className='text-xs text-old-ink/40 mt-3'>
              Green = 3+ appearances (high confidence) · Amber = 2 · Red = 1 (extrapolation risk)
            </p>
          </div>
 
          {/* Editable sections */}
          {sections.map(({ key, label, desc }) => (
            <div key={key} className='border border-old-border/50 rounded-sm overflow-hidden'>
              <button
                onClick={() => setExpandedSection(expandedSection===key ? null : key)}
                className='w-full px-4 py-3 flex items-center justify-between
                  bg-cream-bg/50 hover:bg-cream-bg transition-colors text-left'
              >
                <div>
                  <span className='font-medium text-sm text-old-ink'>{label}</span>
                  <span className='text-xs text-old-ink/50 ml-2'>{desc}</span>
                </div>
                {expandedSection===key
                  ? <ChevronUp className='w-4 h-4 text-old-ink/40'/>
                  : <ChevronDown className='w-4 h-4 text-old-ink/40'/>}
              </button>
              {expandedSection===key && (
                <div className='p-4'>
                  <textarea
                    value={getFieldValue(activeDraft, key)}
                    onChange={e => handleEdit(activeDraft.id, key, e.target.value)}
                    rows={key==='prose_injection' ? 16 : 8}
                    className='w-full text-sm font-mono border border-old-border rounded-sm
                      p-3 bg-white focus:outline-none focus:border-muted-gold resize-y
                      leading-relaxed'
                    placeholder={`Edit ${label.toLowerCase()} here...`}
                  />
                  {key==='prose_injection' && (
                    <p className={`text-xs mt-1 ${
                      getFieldValue(activeDraft,key).length > 2000
                        ? 'text-red-500' : 'text-old-ink/40'
                    }`}>
                      {getFieldValue(activeDraft,key).length} chars (keep under 2000)
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

