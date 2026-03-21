// =============================================================================
// BOCCONI ACE — SUPABASE POPULATION SCRIPT
// Run once to insert all 200 questions and 15 topic profiles
// Usage: npx ts-node populate_supabase.ts
// Requires: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env
// =============================================================================

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

// ESM-compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

interface RawQuestion {
  mock_number: number;
  question_number: number;
  topic: string;
  subtopic: string;
  units_tested: string[];
  difficulty: string;
  question: string;
  options: string[];
  correct_answer: string;
  answer_confidence: string;
  explanation: string;
  has_figure: boolean;
  figure_description: string | null;
  style_analysis: string;
  syllabus_alignment: string;
  source: string;
}

interface RawProfile {
  topic: string;
  question_count: number;
  approved: boolean;
  generation_fingerprint: string | { text?: string };
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// STEP 1: INSERT QUESTIONS
// ---------------------------------------------------------------------------

async function insertQuestions(questions: RawQuestion[]): Promise<Map<string, string>> {
  console.log('\n=== STEP 1: Inserting 200 questions ===');
  
  const questionIdMap = new Map<string, string>(); // "M1Q1" -> uuid
  const BATCH_SIZE = 20;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = questions.slice(i, i + BATCH_SIZE);
    
    const rows = batch.map(q => ({
      mock_number: q.mock_number,
      question_number: q.question_number,
      topic: q.topic,
      subtopic: q.subtopic,
      units_tested: q.units_tested,
      difficulty: q.difficulty,
      question: q.question,
      options: q.options,
      correct_answer: q.correct_answer,
      answer_confidence: q.answer_confidence,
      explanation: q.explanation,
      has_figure: q.has_figure || false,
      figure_description: q.figure_description || null,
      style_analysis: q.style_analysis,
      syllabus_alignment: q.syllabus_alignment,
      source: q.source || `Mock${q.mock_number}`,
      // embedding left null — generated separately
    }));

    const { data, error } = await supabase
      .from('mock_questions')
      .insert(rows)
      .select('id, mock_number, question_number');

    if (error) {
      console.error(`Batch ${Math.floor(i/BATCH_SIZE)+1} error:`, error.message);
      errors += batch.length;
    } else if (data) {
      data.forEach(row => {
        const ref = `M${row.mock_number}Q${row.question_number}`;
        questionIdMap.set(ref, row.id);
      });
      inserted += data.length;
      console.log(`  Batch ${Math.floor(i/BATCH_SIZE)+1}: inserted ${data.length} questions (total: ${inserted})`);
    }
  }

  console.log(`\nQuestions: ${inserted} inserted, ${errors} errors`);
  return questionIdMap;
}

// ---------------------------------------------------------------------------
// STEP 2: INSERT QUESTION UNITS
// ---------------------------------------------------------------------------

async function insertQuestionUnits(
  questions: RawQuestion[],
  questionIdMap: Map<string, string>
): Promise<void> {
  console.log('\n=== STEP 2: Inserting question units ===');

  const unitRows: { question_id: string; unit_name: string; confidence: string }[] = [];

  for (const q of questions) {
    const ref = `M${q.mock_number}Q${q.question_number}`;
    const questionId = questionIdMap.get(ref);
    if (!questionId) continue;

    for (const unit of q.units_tested) {
      unitRows.push({
        question_id: questionId,
        unit_name: unit,
        confidence: 'verified',
      });
    }
  }

  const BATCH_SIZE = 100;
  let inserted = 0;

  for (let i = 0; i < unitRows.length; i += BATCH_SIZE) {
    const batch = unitRows.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('question_units').insert(batch);
    if (error) {
      console.error(`Units batch error:`, error.message);
    } else {
      inserted += batch.length;
    }
  }

  console.log(`Units: ${inserted} inserted`);
}

// ---------------------------------------------------------------------------
// STEP 3: INSERT TOPIC PROFILES
// ---------------------------------------------------------------------------

async function insertProfiles(profileDir: string): Promise<void> {
  console.log('\n=== STEP 3: Inserting 15 topic profiles ===');

  const profileFiles = [
    'profile_rc.json',
    'profile_ct.json',
    'profile_nr.json',
    'profile_algebra.json',
    'profile_ps.json',
    'profile_probability.json',
    'profile_functions.json',
    'profile_analytical_geometry.json',
    'profile_logarithms_exponentials.json',
    'profile_sets.json',
    'profile_statistics.json',
    'profile_numbers.json',
    'profile_plane_geometry.json',
    'profile_discrete_mathematics.json',
    'profile_trigonometry.json',
  ];

  let inserted = 0;
  let errors = 0;

  for (const fname of profileFiles) {
    const fpath = path.join(profileDir, fname);
    if (!fs.existsSync(fpath)) {
      console.error(`  Missing: ${fname}`);
      errors++;
      continue;
    }

    let raw: RawProfile;
    try {
      raw = JSON.parse(fs.readFileSync(fpath, 'utf8'));
    } catch (err) {
      console.error(`  Failed to parse ${fname}: ${err instanceof Error ? err.message : String(err)}`);
      errors++;
      continue;
    }

    // Extract generation fingerprint — handle both string and {text:...} formats
    let fingerprint = raw.generation_fingerprint;
    if (typeof fingerprint === 'object' && fingerprint !== null) {
      fingerprint = (fingerprint as { text?: string }).text || JSON.stringify(fingerprint);
    }

    // Build profile_data: everything except the fields we store separately
    const { topic, question_count, approved, generation_fingerprint, ...rest } = raw;
    const profileData = rest;

    const { error } = await supabase
      .from('topic_profiles')
      .upsert({
        topic: topic,
        profile_data: profileData,
        generation_fingerprint: fingerprint as string,
        question_count: question_count,
        approved: approved || false,
      }, {
        onConflict: 'topic',
      });

    if (error) {
      console.error(`  ${topic}: ERROR — ${error.message}`);
      errors++;
    } else {
      console.log(`  ✓ ${topic} (${question_count} questions)`);
      inserted++;
    }
  }

  console.log(`\nProfiles: ${inserted} inserted, ${errors} errors`);
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------

async function main() {
  console.log('BOCCONI ACE — SUPABASE POPULATION');
  console.log('==================================');
  console.log('URL:', supabaseUrl.substring(0, 30) + '...');

  // Load questions
  const questionsPath = path.join(__dirname, 'all_questions_verified.json');
  if (!fs.existsSync(questionsPath)) {
    console.error('Missing all_questions_verified.json — place it in the same directory as this script');
    process.exit(1);
  }

  let questions: RawQuestion[];
  try {
    questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
  } catch (err) {
    console.error(`Failed to parse questions JSON: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
  console.log(`\nLoaded ${questions.length} questions`);

  // Check for existing data
  const { count: existingCount } = await supabase
    .from('mock_questions')
    .select('*', { count: 'exact', head: true });

  if (existingCount && existingCount > 0) {
    console.log(`\nWARNING: mock_questions already has ${existingCount} rows.`);
    console.log('Proceeding will add duplicates. Clear the table first if needed.');
    console.log('Run: DELETE FROM mock_questions; DELETE FROM question_units; DELETE FROM topic_profiles;');
    console.log('\nExiting to prevent data duplication. Clear manually or use upsert logic.\n');
    process.exit(1);
  }

  // Insert questions
  const questionIdMap = await insertQuestions(questions);

  // Insert units
  await insertQuestionUnits(questions, questionIdMap);

  // Insert profiles
  const profileDir = path.join(__dirname, '.');
  await insertProfiles(profileDir);

  console.log('\n==================================');
  console.log('POPULATION COMPLETE');
  console.log('Next step: run embedding generation in the app');
  console.log('Call generateEmbedding() for each question in mock_questions');
  console.log('==================================');
}

main().catch(console.error);
