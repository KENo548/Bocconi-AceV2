import React, { useMemo } from 'react';
import { SavedSession, QuestionResult } from '../store/useStore';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { BrainCircuit, Clock, Target, TrendingUp, AlertTriangle, Zap, MinusCircle } from 'lucide-react';
import {
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
    Tooltip, Legend, ResponsiveContainer, Cell
} from 'recharts';

interface Props {
    sessions: SavedSession[];
}

const EXPECTED_TIMES: Record<string, Record<'easy' | 'medium' | 'hard', number>> = {
    Algebra: { easy: 76, medium: 86, hard: 105 },
    Functions: { easy: 80, medium: 90, hard: 110 },
    "Plane Geometry": { easy: 72, medium: 81, hard: 99 },
    "Analytical Geometry": { easy: 84, medium: 95, hard: 116 },
    Trigonometry: { easy: 80, medium: 90, hard: 110 },
    Sets: { easy: 80, medium: 90, hard: 110 },
    "Logarithms/Exponentials": { easy: 76, medium: 86, hard: 105 },
    "Discrete Mathematics": { easy: 88, medium: 99, hard: 121 },
    Numbers: { easy: 64, medium: 72, hard: 88 },
    Probability: { easy: 76, medium: 86, hard: 105 },
    "Problem solving": { easy: 96, medium: 108, hard: 132 },
    Statistics: { easy: 64, medium: 72, hard: 88 },
    "Reading comprehension": { easy: 60, medium: 68, hard: 83 },
    "Numerical reasoning": { easy: 72, medium: 81, hard: 99 },
    "Critical thinking": { easy: 72, medium: 81, hard: 99 },
};

export default function SessionAnalysis({ sessions }: Props) {
    const metrics = useMemo(() => {
        // 1. Flatten all results and extract diff lookup
        const allResults: QuestionResult[] = [];
        const diffMap = new Map<string, string>(); // question index key per batch to difficulty

        const scoreTrendData: any[] = [];

        // Sort sessions chronologically for trend
        const sortedSessions = [...sessions].sort((a, b) => a.createdAt - b.createdAt);

        sortedSessions.forEach(session => {
            let sessionScore = 0;
            let sessionAttempts = 0;

            session.batches.forEach(batch => {
                Object.entries(batch.results).forEach(([idxStr, result]) => {
                    allResults.push(result);

                    const idx = parseInt(idxStr);
                    // Try to map to the config difficulty.
                    const difficulty = batch.configs[idx]?.difficulty || 'Medium';
                    diffMap.set(result.id, difficulty);

                    sessionAttempts++;
                    if (result.isCorrect) {
                        sessionScore += 1;
                    } else {
                        sessionScore -= (result.options?.length === 3 ? 0.33 : 0.2);
                    }
                });
            });

            if (sessionAttempts > 0) {
                scoreTrendData.push({
                    name: session.name.substring(0, 15) + (session.name.length > 15 ? '...' : ''),
                    score: Math.max(0, sessionScore), // prevent negative floor on visual chart
                    accuracy: Math.round((sessionScore / sessionAttempts) * 100),
                    questions: sessionAttempts
                });
            }
        });

        if (allResults.length === 0) return null;

        // 2. Compute Top-Level KPIs
        const total = allResults.length;
        const correct = allResults.filter(r => r.isCorrect).length;
        const wrong = total - correct;

        const penaltyCost = allResults.reduce((acc, r) => {
            if (r.isCorrect) return acc;
            return acc + (r.options?.length === 3 ? 0.33 : 0.2);
        }, 0);

        const score = correct - penaltyCost;
        const accuracy = Math.round((correct / total) * 100);
        const avgTime = Math.round(allResults.reduce((acc, r) => acc + r.timeTaken, 0) / total);
        const penaltyPct = ((wrong * 0.2) / total) * 100; // Simplified as per spec

        // 3. By-topic breakdown
        const topicStats: Record<string, { total: number, correct: number, time: number, sumExpected: number }> = {};
        const subtopicStats: Record<string, { total: number, correct: number, time: number }> = {};

        // 4. Difficulty breakdown
        const diffStats: Record<string, { total: number, correct: number }> = {
            Easy: { total: 0, correct: 0 },
            Medium: { total: 0, correct: 0 },
            Hard: { total: 0, correct: 0 }
        };

        const topicDiffStats: Record<string, { total: number, correct: number, time: number, topic: string, difficulty: string }> = {};

        allResults.forEach(r => {
            const diff = diffMap.get(r.id) || 'Medium';
            const diffKey = diff.toLowerCase() as 'easy' | 'medium' | 'hard';

            // Topic
            if (!topicStats[r.topic]) topicStats[r.topic] = { total: 0, correct: 0, time: 0, sumExpected: 0 };
            const expectedForThis = EXPECTED_TIMES[r.topic]?.[diffKey] || 90;
            topicStats[r.topic].total++;
            topicStats[r.topic].time += r.timeTaken;
            topicStats[r.topic].sumExpected += expectedForThis;
            if (r.isCorrect) topicStats[r.topic].correct++;

            // Topic + Difficulty (for timing flags)
            const tdKey = `${r.topic} (${diff})`;
            if (!topicDiffStats[tdKey]) topicDiffStats[tdKey] = { total: 0, correct: 0, time: 0, topic: r.topic, difficulty: diff };
            topicDiffStats[tdKey].total++;
            topicDiffStats[tdKey].time += r.timeTaken;
            if (r.isCorrect) topicDiffStats[tdKey].correct++;

            // Subtopic
            const subKey = `${r.topic} › ${r.subtopic}`;
            if (!subtopicStats[subKey]) subtopicStats[subKey] = { total: 0, correct: 0, time: 0 };
            subtopicStats[subKey].total++;
            subtopicStats[subKey].time += r.timeTaken;
            if (r.isCorrect) subtopicStats[subKey].correct++;

            // Difficulty
            if (diffStats[diff]) {
                diffStats[diff].total++;
                if (r.isCorrect) diffStats[diff].correct++;
            }
        });

        const topicAccuracy = Object.entries(topicStats).map(([topic, stats]) => {
            const expectedTime = Math.round(stats.sumExpected / stats.total);
            const tAvg = Math.round(stats.time / stats.total);
            return {
                topic,
                shortName: topic.split(' ')[0],
                accuracy: Math.round((stats.correct / stats.total) * 100),
                avgTime: tAvg,
                total: stats.total,
                correct: stats.correct,
                wrong: stats.total - stats.correct,
                expectedTime,
                timeEfficiency: Math.round((expectedTime / tAvg) * 100)
            };
        }).sort((a, b) => b.accuracy - a.accuracy);

        // 5. Time Management Flags (Granular: Topic + Difficulty)
        const topicDiffAccuracy = Object.entries(topicDiffStats).map(([key, stats]) => {
            const expectedTime = EXPECTED_TIMES[stats.topic]?.[stats.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard'] || 90;
            const tAvg = Math.round(stats.time / stats.total);
            return {
                topic: key,
                shortName: key,
                avgTime: tAvg,
                expectedTime,
                accuracy: Math.round((stats.correct / stats.total) * 100)
            };
        });

        const slowTopics = topicDiffAccuracy.filter(t => t.avgTime > t.expectedTime * 1.3);
        const fastTopics = topicDiffAccuracy.filter(t => t.avgTime < t.expectedTime * 0.7);

        // 6. Subtopic Analysis (Min 2 attempts)
        const validSubtopics = Object.entries(subtopicStats)
            .filter(([_, stats]) => stats.total >= 2)
            .map(([name, stats]) => ({
                name,
                accuracy: Math.round((stats.correct / stats.total) * 100),
                total: stats.total
            }));

        const weakSubtopics = validSubtopics.filter(s => s.accuracy < 60).sort((a, b) => a.accuracy - b.accuracy).slice(0, 5);
        const strongSubtopics = validSubtopics.filter(s => s.accuracy >= 80).sort((a, b) => b.accuracy - a.accuracy).slice(0, 3);

        // 7. Difficulty Format
        const diffBreakdown = Object.entries(diffStats).map(([diff, stats]) => {
            const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
            let fill = '#B89E58'; // muted gold defaults
            if (acc >= 70) fill = '#4A5D23'; // olive
            else if (acc < 50) fill = '#7A3E3E'; // burgundy

            return {
                difficulty: diff,
                accuracy: acc,
                fill
            };
        });

        return {
            total, correct, wrong, score, accuracy, avgTime, penaltyCost, penaltyPct,
            topicAccuracy,
            slowTopics, fastTopics,
            weakSubtopics, strongSubtopics,
            diffBreakdown,
            scoreTrend: scoreTrendData
        };
    }, [sessions]);

    if (!metrics) {
        return (
            <div className="flex flex-col items-center justify-center py-16 text-old-ink/60 bg-cream-bg rounded-md border border-old-border">
                <BrainCircuit className="w-12 h-12 mb-4 opacity-50" />
                <p>No practice data available for analysis yet.</p>
                <p className="text-sm mt-2">Complete a practice session to see insights here.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* ── TOP-LEVEL KPIs ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-hunter-green/20 bg-hunter-green/5">
                    <CardContent className="p-6">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-hunter-green uppercase tracking-wider">Net Score</span>
                            <Target className="w-5 h-5 text-hunter-green" />
                        </div>
                        <span className="text-3xl font-serif font-bold text-hunter-green">{metrics.score.toFixed(1)}</span>
                        <div className="text-xs text-hunter-green/70 mt-1 font-medium">/{metrics.total} Max Points</div>
                    </CardContent>
                </Card>

                <Card className="border-old-border bg-white pt-6">
                    <CardContent>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-old-ink/70">Accuracy</span>
                            <BrainCircuit className="w-5 h-5 text-muted-gold" />
                        </div>
                        <span className="text-3xl font-serif font-bold text-old-ink">{metrics.accuracy}%</span>
                        <div className="text-xs text-old-ink/50 mt-1">{metrics.correct} correct, {metrics.wrong} wrong</div>
                    </CardContent>
                </Card>

                <Card className="border-old-border bg-white pt-6">
                    <CardContent>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-old-ink/70">Avg Pace</span>
                            <Clock className="w-5 h-5 text-muted-gold" />
                        </div>
                        <span className="text-3xl font-serif font-bold text-old-ink">{metrics.avgTime}s</span>
                        <div className="text-xs text-old-ink/50 mt-1">Target ~90s per Q</div>
                    </CardContent>
                </Card>

                <Card className="border-red-900/20 bg-red-50 pt-6">
                    <CardContent>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-red-800">Penalty Cost</span>
                            <MinusCircle className="w-5 h-5 text-red-700" />
                        </div>
                        <span className="text-3xl font-serif font-bold text-red-800">-{metrics.penaltyCost.toFixed(1)}</span>
                        <div className="text-xs text-red-700/70 mt-1">Lost from wrong guesses</div>
                    </CardContent>
                </Card>
            </div>

            {/* ── CHARTS ROW 1 ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-old-border">
                    <CardHeader>
                        <CardTitle className="text-base font-medium text-old-ink font-serif uppercase tracking-widest flex items-center">
                            <Target className="w-5 h-5 mr-2 text-hunter-green" /> Accuracy by Topic (Radar)
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart outerRadius={90} data={metrics.topicAccuracy}>
                                <PolarGrid stroke="#e5e5e5" />
                                <PolarAngleAxis dataKey="shortName" tick={{ fill: '#3b433d', fontSize: 11 }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar name="Accuracy %" dataKey="accuracy" stroke="#4A5D23" fill="#4A5D23" fillOpacity={0.4} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #dcdacb' }}
                                    itemStyle={{ color: '#4A5D23', fontWeight: 'bold' }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-old-border">
                    <CardHeader>
                        <CardTitle className="text-base font-medium text-old-ink font-serif uppercase tracking-widest flex items-center">
                            <TrendingUp className="w-5 h-5 mr-2 text-hunter-green" /> Score Trend
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            {metrics.scoreTrend.length >= 2 ? (
                                <LineChart data={metrics.scoreTrend} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6f7362' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#6f7362' }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: '#fff', border: '1px solid #dcdacb' }} />
                                    <Line type="monotone" dataKey="score" stroke="#B89E58" strokeWidth={3} dot={{ r: 4, fill: '#B89E58' }} activeDot={{ r: 6 }} />
                                </LineChart>
                            ) : (
                                <BarChart data={metrics.scoreTrend} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#6f7362' }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fontSize: 12, fill: '#6f7362' }} axisLine={false} tickLine={false} />
                                    <Tooltip />
                                    <Bar dataKey="score" fill="#B89E58" radius={[4, 4, 0, 0]} maxBarSize={60} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* ── CHARTS ROW 2 ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="border-old-border">
                    <CardHeader>
                        <CardTitle className="text-base font-medium text-old-ink font-serif uppercase tracking-widest flex items-center">
                            <Clock className="w-5 h-5 mr-2 text-hunter-green" /> Time Actual vs Target
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.topicAccuracy} margin={{ top: 10, right: 10, left: -20, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                <XAxis dataKey="shortName" tick={{ fontSize: 10, fill: '#6f7362' }} angle={-45} textAnchor="end" />
                                <YAxis tick={{ fontSize: 11, fill: '#6f7362' }} />
                                <Tooltip cursor={{ fill: '#f6f5f0' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #dcdacb' }} />
                                <Legend verticalAlign="top" height={36} iconType="circle" />
                                <Bar dataKey="avgTime" name="Actual Time (s)" fill="#7A3E3E" radius={[2, 2, 0, 0]} />
                                <Bar dataKey="expectedTime" name="Target Time (s)" fill="#B89E58" radius={[2, 2, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                <Card className="border-old-border">
                    <CardHeader>
                        <CardTitle className="text-base font-medium text-old-ink font-serif uppercase tracking-widest flex items-center">
                            <BrainCircuit className="w-5 h-5 mr-2 text-hunter-green" /> Accuracy by Difficulty
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={metrics.diffBreakdown} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                                <XAxis dataKey="difficulty" tick={{ fontSize: 12, fill: '#6f7362' }} axisLine={false} tickLine={false} />
                                <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#6f7362' }} axisLine={false} tickLine={false} />
                                <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #dcdacb' }} />
                                <Bar dataKey="accuracy" name="Accuracy %" radius={[6, 6, 0, 0]}>
                                    {metrics.diffBreakdown.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* ── ACTIONABLE INSIGHTS ROW ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* WEAKNESSES */}
                <Card className="border-red-900/20 bg-red-50/30 lg:col-span-1">
                    <CardHeader className="pb-3 border-b border-red-900/10 bg-red-50/50">
                        <CardTitle className="text-sm font-semibold text-red-800 uppercase tracking-widest flex items-center">
                            <AlertTriangle className="w-4 h-4 mr-2" /> Priority Fix Areas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 p-0">
                        {metrics.weakSubtopics.length > 0 ? (
                            <ul className="divide-y divide-red-900/10">
                                {metrics.weakSubtopics.map((sub, i) => (
                                    <li key={i} className="px-4 py-3 flex justify-between items-center group hover:bg-red-50/80 transition-colors">
                                        <div>
                                            <span className="block font-medium text-red-900 text-sm">{sub.name.split(' › ')[1]}</span>
                                            <span className="block text-xs text-red-700/70">{sub.name.split(' › ')[0]}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-red-800 block">{sub.accuracy}%</span>
                                            <span className="text-xs text-red-700/60 block">{sub.total} attempts</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="p-6 text-center text-sm text-red-800/60 flex flex-col items-center">
                                <Target className="w-8 h-8 mb-2 opacity-50 text-red-800/40" />
                                <p>No critical weak spots identified yet.</p>
                                <p className="text-xs mt-1">Need at least 2 attempts per subtopic under 60% accuracy to trigger alerts.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* STRENGTHS */}
                <Card className="border-hunter-green/20 bg-hunter-green/5 lg:col-span-1">
                    <CardHeader className="pb-3 border-b border-hunter-green/10 bg-hunter-green/10">
                        <CardTitle className="text-sm font-semibold text-hunter-green uppercase tracking-widest flex items-center">
                            <Zap className="w-4 h-4 mr-2" /> Strong Areas
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 p-0">
                        {metrics.strongSubtopics.length > 0 ? (
                            <ul className="divide-y divide-hunter-green/10">
                                {metrics.strongSubtopics.map((sub, i) => (
                                    <li key={i} className="px-4 py-3 flex justify-between items-center hover:bg-hunter-green/5 transition-colors">
                                        <div>
                                            <span className="block font-medium text-hunter-green text-sm">{sub.name.split(' › ')[1]}</span>
                                            <span className="block text-xs text-hunter-green/70">{sub.name.split(' › ')[0]}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="font-bold text-hunter-green block">{sub.accuracy}%</span>
                                            <span className="text-xs text-hunter-green/60 block">{sub.total} attempts</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div className="p-6 text-center text-sm text-hunter-green/60 flex flex-col items-center">
                                <BrainCircuit className="w-8 h-8 mb-2 opacity-50 text-hunter-green/40" />
                                <p>Keep practicing to build proven strengths!</p>
                                <p className="text-xs mt-1">Need at least 2 attempts over 80% accuracy.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* TIME MANAGEMENT */}
                <Card className="border-old-border lg:col-span-1">
                    <CardHeader className="pb-3 border-b border-old-border/50 bg-cream-card/50">
                        <CardTitle className="text-sm font-semibold text-old-ink uppercase tracking-widest flex items-center">
                            <Clock className="w-4 h-4 mr-2 text-muted-gold" /> Time Management Flags
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-4">

                        {/* Slow */}
                        <div>
                            <h4 className="text-xs font-bold text-red-800 uppercase tracking-wider mb-2 flex items-center">
                                <AlertTriangle className="w-3 h-3 mr-1" /> Critically Slow
                            </h4>
                            {metrics.slowTopics.length > 0 ? (
                                <ul className="space-y-2">
                                    {metrics.slowTopics.slice(0, 3).map((t, i) => (
                                        <li key={i} className="text-sm flex justify-between bg-red-50/50 p-2 rounded-sm border border-red-100">
                                            <span className="font-medium text-old-ink">{t.shortName}</span>
                                            <span className="text-red-700 font-mono">{t.avgTime}s <span className="text-red-400 text-xs">(vs {t.expectedTime}s)</span></span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-sm text-old-ink/50 py-1">All topics within acceptable pace limits.</div>
                            )}
                        </div>

                        <div className="border-t border-old-border/30 pt-3">
                            <h4 className="text-xs font-bold text-hunter-green uppercase tracking-wider mb-2 flex items-center">
                                <Zap className="w-3 h-3 mr-1" /> Critically Fast
                            </h4>
                            {metrics.fastTopics.length > 0 ? (
                                <ul className="space-y-2">
                                    {metrics.fastTopics.slice(0, 3).map((t, i) => (
                                        <li key={i} className="text-sm flex justify-between bg-hunter-green/5 p-2 rounded-sm border border-hunter-green/10">
                                            <span className="font-medium text-old-ink">{t.shortName}</span>
                                            {t.accuracy < 60 ? (
                                                <span className="text-red-600 font-mono text-xs">{t.avgTime}s (Acc: {t.accuracy}%) - Slow down!</span>
                                            ) : (
                                                <span className="text-hunter-green font-mono text-xs">{t.avgTime}s (Acc: {t.accuracy}%) - Excellent pace</span>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div className="text-sm text-old-ink/50 py-1">No unusually fast timings detected.</div>
                            )}
                        </div>

                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
