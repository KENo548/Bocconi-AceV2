import { loadApprovedProfile, findSimilarQuestions, TopicProfile, MockQuestion } from './supabase';
import { generateEmbedding } from './gemini';
import { QuestionConfig } from '../store/useStore';
 
export interface GenerationContext {
  approvedProfiles: Record<string, TopicProfile>;
  similarExamplesMap: Record<string, MockQuestion[]>;
  extrapolationFlags: Record<string, boolean>; // key=topic, true if any unit is low-coverage
}
 
/**
 * Build the full generation context for a set of question configs.
 * Fetches approved profiles + vector similar examples for each unique topic.
 * Called once before generateQuestions in both QuestionBatchView and PaperBuilder.
 */
export async function buildGenerationContext(
  configs: QuestionConfig[]
): Promise<GenerationContext> {
  const uniqueTopics = [...new Set(configs.map(c => c.topic))];
  const approvedProfiles: Record<string, TopicProfile> = {};
  const similarExamplesMap: Record<string, MockQuestion[]> = {};
  const extrapolationFlags: Record<string, boolean> = {};
 
  await Promise.all(uniqueTopics.map(async (topic) => {
    // Fetch approved profile for this topic
    const profile = await loadApprovedProfile(topic);
    if (profile) {
      approvedProfiles[topic] = profile;
    }
 
    // Build a query for vector search: topic description as embedding
    const queryText = `${topic} Bocconi entrance test question`;
    const queryEmbedding = await generateEmbedding(queryText);
 
    // Get configs for this topic to find the difficulty needed
    const topicConfigs = configs.filter(c => c.topic === topic);
    const difficulty = topicConfigs[0]?.difficulty ?? 'Medium';
 
    if (queryEmbedding.length > 0) {
      const examples = await findSimilarQuestions(
        queryEmbedding, topic, difficulty, 3
      );
      similarExamplesMap[topic] = examples;
    }
 
    // Check if any requested unit is low-coverage
    if (profile) {
      const allCoverage = Object.values(profile.coverage_map);
      const hasLowCoverage = allCoverage.some(e => e.confidence === 'low');
      extrapolationFlags[topic] = hasLowCoverage;
    }
  }));
 
  return { approvedProfiles, similarExamplesMap, extrapolationFlags };
}

