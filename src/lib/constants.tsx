import React from 'react';
import Markdown, { Components } from 'react-markdown';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';

export const SYLLABUS = [
    {
        subject: "Mathematics",
        topics: ["Algebra", "Functions", "Plane Geometry", "Analytical Geometry", "Trigonometry", "Sets", "Logarithms/Exponentials", "Discrete Mathematics", "Numbers", "Probability", "Problem solving", "Statistics"]
    },
    {
        subject: "Reading Comprehension",
        topics: ["Reading comprehension"]
    },
    {
        subject: "Numerical Reasoning",
        topics: ["Numerical reasoning"]
    },
    {
        subject: "Critical Thinking",
        topics: ["Critical thinking"]
    }
];

export const ALL_TOPICS = SYLLABUS.flatMap(s => s.topics);

export const mdComponents: Components = {
    p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    table: ({ children }) => (
        <div className="overflow-x-auto my-3 border border-old-border/50 rounded-sm">
            <table className="w-full text-sm text-left">{children}</table>
        </div>
    ),
    thead: ({ children }) => <thead className="bg-muted-gold/10 text-xs uppercase">{children}</thead>,
    tr: ({ children }) => <tr className="border-b border-old-border/30 last:border-0">{children}</tr>,
    th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
    td: ({ children }) => <td className="px-3 py-2">{children}</td>,
    code: ({ children }) => (
        <code className="bg-muted-gold/10 text-hunter-green px-1 py-0.5 rounded font-mono text-sm">
            {children}
        </code>
    ),
    pre: ({ children }) => (
        <pre className="bg-old-ink text-cream-bg p-3 rounded-sm overflow-x-auto my-3 text-sm">
            {children}
        </pre>
    ),
};

/**
 * Sanitizes text so only genuinely complex LaTeX math is preserved.
 * 
 * Strategy:
 * 1. Protect display math: $$...$$ blocks (always kept)
 * 2. For inline math $...$:
 *    - If content is "trivial" (plain number, single letter, percentage,
 *      or simple text without operators) → STRIP the $ delimiters, output as plain text
 *    - If content has real math (operators, fractions, exponents, roots, etc.) → keep as LaTeX
 * 3. Replace ALL remaining stray $ with fullwidth dollar ＄ (invisible to remark-math)
 * 4. Restore protected blocks
 */
export function sanitizeCurrency(text: string): string {
    const placeholders: string[] = [];
    const ph = (s: string) => {
        placeholders.push(s);
        return `___MATH_BLOCK_${placeholders.length - 1}___`;
    };

    // 1. Protect display math blocks: $$...$$
    let result = text.replace(/\$\$[\s\S]+?\$\$/g, m => ph(m));

    // 2. Process inline math: $...$
    //    Match $ followed by non-$ content followed by $
    result = result.replace(/\$([^\$]+?)\$/g, (_match, content: string) => {
        const trimmed = content.trim();

        // If it's empty, ignore it (will become escaped later)
        if (!trimmed) return _match;

        // Check if this matched block is actually a false positive block.
        // E.g., matched "$20 and the other is $" -> content is "20 and the other is ".
        // A genuine inline math block should not contain multiple normal English words.
        const hasMathOperator = /[+\-=<>\/\^\\()[\]{}|*]/.test(trimmed);
        const wordCount = trimmed.split(/\s+/).length;
        if (wordCount >= 2 && !hasMathOperator) {
            // False block! Contains multiple words but no math symbols.
            // Do NOT protect it. Return the original match so it gets picked up by the next stages.
            return _match;
        }

        // Trivial checks (single numbers, single letters, percentages)
        const isTrivial =
            /^[\d,.\s]+$/.test(trimmed) ||           // plain numbers: 49, 148.50, 1,000
            /^[A-Za-z]$/.test(trimmed) ||             // single letter: L, W, A, x
            /^[\d,.\s]+%$/.test(trimmed) ||           // percentage: 20%, 15%
            /^[\d,.\s]+\\?%$/.test(trimmed) ||        // percentage with escaped %
            /^[A-Za-z]\s*$/.test(trimmed) ||          // single letter with space
            /^[\d,.\s]+\s*(meters|km|kg|dollars|USD|cm|mm|units|hours|minutes|seconds|liters|grams|million|billion|thousand)/i.test(trimmed);

        if (isTrivial) {
            // It's trivial math. Strip the $ delimiters so it renders as plain text.
            return trimmed.replace(/\\%/g, '%');
        }

        // Content has real math — protect it
        return ph(`$${content}$`);
    });

    // 3. Escape ALL remaining stray $ so remark-math ignores them, but they still print as $
    // This perfectly fixes the "currency" dollar sign issue.
    result = result.replace(/\$/g, '\\$');

    // 4. Final safety net: if common LaTeX commands exist without delimiters, wrap them
    // Use negative lookbehind/lookahead logic to only wrap if NOT already delimited by $
    // (Manual check as most JS environments lack full lookbehind/lookahead for some symbols)
    const commands = [
        /\\frac\{[^{}]*\}\{[^{}]*\}/g,
        /\\sqrt\{[^{}]*\}/g,
        /\d+\\cdot\d+/g,
        /\\degree/g,
        /\\pm/g,
        /\\times/g,
        /\\div/g,
        /\\approx/g
    ];

    commands.forEach(pattern => {
        result = result.replace(pattern, (match, offset, fullString) => {
            const hasPre = fullString[offset - 1] === '$';
            const hasPost = fullString[offset + match.length] === '$';
            if (hasPre && hasPost) return match; // Already wrapped
            return `$${match}$`;
        });
    });

    // 6. Finally restore protected math blocks
    result = result.replace(/___MATH_BLOCK_(\d+)___/g, (_, i) => placeholders[parseInt(i)]);

    return result;
}

interface MathTextProps {
    children: string;
    className?: string;
}

export function MathText({ children, className = "" }: MathTextProps) {
    return (
        <div className={className}>
            <Markdown remarkPlugins={[remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]} components={mdComponents}>
                {sanitizeCurrency(children)}
            </Markdown>
        </div>
    );
}

export function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(timestamp: number): string {
    return new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }).format(new Date(timestamp));
}
