Bocconi Ace
Pattern Recognition Engine — Complete Implementation Guide
Upload this document to your IDE. Follow every step in order without skipping.


Architecture Overview
This guide implements a five-phase pattern recognition engine that learns from your 160 ingested questions and uses that knowledge to generate questions with maximum Bocconi style adherence. Every design decision is explained.

Phase 1	Taxonomy — Hard-coded 3-level subject tree lives in a TypeScript constant. Never injected wholesale. Always sliced to the relevant topic only.
Phase 2	Extraction — Gemini 2.0 Flash Vision reads PDFs. Each question gets tagged against the taxonomy slice for its topic. chartData fully captured for figures.
Phase 3	Manual Tag Review — You review and correct every question's topic, subtopic, and deep unit tags before they influence anything. Persists in Supabase.
Phase 4	Profile Analysis — Gemini 2.5 Pro analyses all questions per topic, one topic at a time. Produces draft TopicProfile covering: coverage map, difficulty ladder, distractor taxonomy, time pressure indicators, calibrated uplift, figure patterns. You review and approve each profile before it goes live.
Phase 5	Enhanced Generation — Approved profiles injected per-topic. Vector similarity search retrieves the 2-3 most relevant real examples as few-shot context. Extrapolated subtopics get a warning flag shown to the user.

 
As for now, stay in standby and await further instructions.