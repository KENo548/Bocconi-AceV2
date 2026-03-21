import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Missing Supabase environment variables! Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ── ADD TO BOTTOM OF src/services/supabase.ts ───────────────────────────────
 
export interface CoverageEntry {
  count: number;
  confidence: 'high' | 'medium' | 'low'; // high=3+, medium=2, low=1
}

export interface MockQuestion {
  id: string;
  folder_id?: string | null;
  topic: string;
  subtopic: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  question: string;
  options: string[];
  correct_answer: string;
  explanation?: string;
  style_analysis?: string;
  syllabus_alignment?: string;
  embedding?: number[] | null;
  created_at?: string;
}

export interface IngestFolder {
  id: string;
  name: string;
  created_at?: string;
}
 
export interface TopicProfile {
  id: string;
  topic: string;
  coverage_map: Record<string, CoverageEntry>; // key = unit name
  difficulty_ladder: string;
  distractor_taxonomy: string;
  time_pressure: string;
  calibrated_uplift: string;
  figure_patterns: string;
  prose_injection: string;
  representative_q_ids: {
    Easy: string[];
    Medium: string[];
    Hard: string[];
  };
  question_count: number;
  approved: boolean;
  approved_at: string | null;
  updated_at: string;
}
 
export interface ProfileDraft {
  id: string;
  topic: string;
  folder_id: string | null;
  coverage_map: Record<string, CoverageEntry>;
  difficulty_ladder: string;
  distractor_taxonomy: string;
  time_pressure: string;
  calibrated_uplift: string;
  figure_patterns: string;
  prose_injection: string;
  representative_q_ids: { Easy: string[]; Medium: string[]; Hard: string[] };
  question_count: number;
  diff_from_approved: Record<string, { old: string; new: string }> | null;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  created_at: string;
}
 
export interface QuestionUnit {
  id: string;
  question_id: string;
  subtopic: string;
  unit: string;
  review_status: 'pending' | 'approved' | 'corrected';
}
 
export interface TagReviewStatus {
  question_id: string;
  status: 'pending' | 'approved' | 'corrected';
  reviewed_at: string | null;
}

// ── Question Units ───────────────────────────────────────────────────────────
 
export async function insertQuestionUnits(
  questionId: string,
  units: { subtopic: string; unit: string }[]
): Promise<void> {
  if (units.length === 0) return;
  const rows = units.map(u => ({
    question_id: questionId,
    subtopic: u.subtopic,
    unit: u.unit,
    review_status: 'pending',
  }));
  const { error } = await supabase.from('question_units').insert(rows);
  if (error) throw new Error(`Failed to insert units: ${error.message}`);
}
 
export async function loadUnitsForQuestion(questionId: string): Promise<QuestionUnit[]> {
  const { data, error } = await supabase
    .from('question_units')
    .select('*')
    .eq('question_id', questionId);
  if (error) throw new Error(`Failed to load units: ${error.message}`);
  return data ?? [];
}
 
export async function updateQuestionUnits(
  questionId: string,
  units: { subtopic: string; unit: string }[]
): Promise<void> {
  // Delete existing and reinsert corrected ones
  await supabase.from('question_units').delete().eq('question_id', questionId);
  if (units.length > 0) {
    const rows = units.map(u => ({
      question_id: questionId,
      subtopic: u.subtopic,
      unit: u.unit,
      review_status: 'corrected',
    }));
    const { error } = await supabase.from('question_units').insert(rows);
    if (error) throw new Error(`Failed to update units: ${error.message}`);
  }
}
 
export async function loadQuestionsForFolder(folderId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('mock_questions')
    .select('*')
    .eq('folder_id', folderId);
  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  return data ?? [];
}

export async function createIngestFolder(name: string): Promise<IngestFolder> {
  const { data, error } = await supabase
    .from('ingest_folders')
    .insert({ name })
    .select()
    .single();
  if (error) throw new Error(`Failed to create ingest folder: ${error.message}`);
  return data;
}

export async function loadIngestFolders(): Promise<IngestFolder[]> {
  const { data, error } = await supabase
    .from('ingest_folders')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load ingest folders: ${error.message}`);
  return data ?? [];
}

export async function insertMockQuestions(
  rows: Array<{
    id: string;
    folder_id: string;
    topic: string;
    subtopic: string;
    difficulty: 'Easy' | 'Medium' | 'Hard';
    question: string;
    options: string[];
    correct_answer: string;
    explanation: string;
    chart_data?: any;
    style_analysis?: string;
    syllabus_alignment?: string;
    source?: string;
  }>
): Promise<MockQuestion[]> {
  if (rows.length === 0) return [];
  const { data, error } = await supabase
    .from('mock_questions')
    .insert(rows)
    .select();
  if (error) throw new Error(`Failed to insert mock questions: ${error.message}`);
  return (data ?? []) as MockQuestion[];
}
 
export async function loadUnitsForFolder(
  folderId: string
): Promise<Record<string, QuestionUnit[]>> {
  // Returns a map of questionId -> units[]
  const questions = await loadQuestionsForFolder(folderId);
  const qIds = questions.map(q => q.id);
  if (qIds.length === 0) return {};
  const { data, error } = await supabase
    .from('question_units')
    .select('*')
    .in('question_id', qIds);
  if (error) throw new Error(`Failed to load folder units: ${error.message}`);
  const map: Record<string, QuestionUnit[]> = {};
  (data ?? []).forEach(u => {
    if (!map[u.question_id]) map[u.question_id] = [];
    map[u.question_id].push(u);
  });
  return map;
}

// ── Tag Review Progress ──────────────────────────────────────────────────────
 
export async function initTagReview(folderId: string, questionIds: string[]): Promise<void> {
  // Called once after extraction — seeds pending rows for each question
  const rows = questionIds.map(qid => ({
    folder_id: folderId,
    question_id: qid,
    status: 'pending',
  }));
  // upsert — safe to call multiple times
  const { error } = await supabase
    .from('question_tag_review')
    .upsert(rows, { onConflict: 'folder_id,question_id' });
  if (error) throw new Error(`Failed to init tag review: ${error.message}`);
}
 
export async function markQuestionReviewed(
  folderId: string,
  questionId: string,
  status: 'approved' | 'corrected'
): Promise<void> {
  const { error } = await supabase
    .from('question_tag_review')
    .update({ status, reviewed_at: new Date().toISOString() })
    .eq('folder_id', folderId)
    .eq('question_id', questionId);
  if (error) throw new Error(`Failed to mark reviewed: ${error.message}`);
}
 
export async function loadTagReviewProgress(
  folderId: string
): Promise<Record<string, TagReviewStatus>> {
  const { data, error } = await supabase
    .from('question_tag_review')
    .select('*')
    .eq('folder_id', folderId);
  if (error) throw new Error(`Failed to load review progress: ${error.message}`);
  const map: Record<string, TagReviewStatus> = {};
  (data ?? []).forEach(r => { map[r.question_id] = r; });
  return map;
}
 
export async function getTagReviewStats(folderId: string): Promise<{
  total: number; pending: number; reviewed: number;
}> {
  const { data } = await supabase
    .from('question_tag_review')
    .select('status')
    .eq('folder_id', folderId);
  const all = data ?? [];
  const pending = all.filter(r => r.status === 'pending').length;
  return { total: all.length, pending, reviewed: all.length - pending };
}

// ── Profile Drafts ────────────────────────────────────────────────────────────
 
export async function saveProfileDraft(draft: Omit<ProfileDraft,'id'|'created_at'>): Promise<ProfileDraft> {
  const { data, error } = await supabase
    .from('profile_drafts')
    .insert(draft)
    .select()
    .single();
  if (error) throw new Error(`Failed to save draft: ${error.message}`);
  return data;
}
 
export async function loadPendingDrafts(folderId: string): Promise<ProfileDraft[]> {
  const { data, error } = await supabase
    .from('profile_drafts')
    .select('*')
    .eq('folder_id', folderId)
    .eq('status', 'pending')
    .order('topic');
  if (error) throw new Error(`Failed to load drafts: ${error.message}`);
  return data ?? [];
}
 
export async function loadAllPendingDrafts(): Promise<ProfileDraft[]> {
  const { data, error } = await supabase
    .from('profile_drafts')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Failed to load all pending drafts: ${error.message}`);
  return data ?? [];
}
 
export async function updateDraftStatus(
  draftId: string,
  status: 'approved' | 'rejected' | 'skipped'
): Promise<void> {
  const { error } = await supabase
    .from('profile_drafts')
    .update({ status })
    .eq('id', draftId);
  if (error) throw new Error(`Failed to update draft: ${error.message}`);
}
 
// ── Topic Profiles (approved) ─────────────────────────────────────────────────
 
export async function approveProfileDraft(
  draft: ProfileDraft,
  editedFields: Partial<Pick<ProfileDraft,
    'difficulty_ladder'|'distractor_taxonomy'|'time_pressure'|
    'calibrated_uplift'|'figure_patterns'|'prose_injection'
  >>
): Promise<TopicProfile> {
  // Merge edits into draft
  const finalData = { ...draft, ...editedFields };
 
  // Check if approved profile already exists for this topic
  const { data: existing } = await supabase
    .from('topic_profiles')
    .select('id')
    .eq('topic', draft.topic)
    .single();
 
  const profileData = {
    topic: finalData.topic,
    coverage_map: finalData.coverage_map,
    difficulty_ladder: finalData.difficulty_ladder,
    distractor_taxonomy: finalData.distractor_taxonomy,
    time_pressure: finalData.time_pressure,
    calibrated_uplift: finalData.calibrated_uplift,
    figure_patterns: finalData.figure_patterns,
    prose_injection: finalData.prose_injection,
    representative_q_ids: finalData.representative_q_ids,
    question_count: finalData.question_count,
    approved: true,
    approved_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
 
  let result;
  if (existing) {
    const { data, error } = await supabase
      .from('topic_profiles')
      .update(profileData)
      .eq('id', existing.id)
      .select().single();
    if (error) throw new Error(`Failed to update profile: ${error.message}`);
    result = data;
  } else {
    const { data, error } = await supabase
      .from('topic_profiles')
      .insert(profileData)
      .select().single();
    if (error) throw new Error(`Failed to insert profile: ${error.message}`);
    result = data;
  }
 
  // Mark draft as approved
  await updateDraftStatus(draft.id, 'approved');
  return result;
}
 
export async function loadApprovedProfile(topic: string): Promise<TopicProfile | null> {
  const { data } = await supabase
    .from('topic_profiles')
    .select('*')
    .eq('topic', topic)
    .eq('approved', true)
    .single();
  return data ?? null;
}
 
export async function loadAllApprovedProfiles(): Promise<TopicProfile[]> {
  const { data, error } = await supabase
    .from('topic_profiles')
    .select('*')
    .eq('approved', true);
  if (error) throw new Error(`Failed to load profiles: ${error.message}`);
  return data ?? [];
}

// ── Embeddings and Vector Search ─────────────────────────────────────────────
 
export async function saveEmbedding(questionId: string, embedding: number[]): Promise<void> {
  const { error } = await supabase
    .from('mock_questions')
    .update({ embedding })
    .eq('id', questionId);
  if (error) throw new Error(`Failed to save embedding: ${error.message}`);
}
 
export async function loadQuestionsByTopicAndDifficulty(
  topic: string,
  difficulty: 'Easy' | 'Medium' | 'Hard'
): Promise<any[]> {
  const { data, error } = await supabase
    .from('mock_questions')
    .select('*')
    .eq('topic', topic)
    .eq('difficulty', difficulty);
  if (error) throw new Error(`Failed to load questions: ${error.message}`);
  return data ?? [];
}
 
// Find the N most semantically similar questions to a query embedding
// topic and difficulty filters narrow the search to relevant candidates only
export async function findSimilarQuestions(
  queryEmbedding: number[],
  topic: string,
  difficulty: 'Easy' | 'Medium' | 'Hard',
  limit = 3
): Promise<MockQuestion[]> {
  // Supabase vector similarity search via RPC
  const { data, error } = await supabase.rpc('match_questions', {
    query_embedding: queryEmbedding,
    topic_filter: topic,
    difficulty_filter: difficulty,
    match_count: limit,
  });
  if (error) {
    // Fallback to random selection if vector search fails
    console.warn('Vector search failed, falling back to random:', error.message);
    return loadQuestionsByTopicAndDifficulty(topic, difficulty)
      .then(qs => qs.sort(() => 0.5 - Math.random()).slice(0, limit));
  }
  return data ?? [];
}
