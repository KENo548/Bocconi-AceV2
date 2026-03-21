// src/services/mathVerifier.ts
// ─────────────────────────────────────────────────────────────────────────────
// Math verification pipeline using Nerdamer (browser-side CAS)
// Architecture:
//   1. DeepSeek R1 generates question + structured math extraction
//   2. Nerdamer solves the equation
//   3. Our code applies constraints + validates all options
//   4. If exactly one option is valid → accept, else regenerate
// ─────────────────────────────────────────────────────────────────────────────

// Topics where Nerdamer verification is applied
export const VERIFIABLE_TOPICS = new Set([
  'Algebra',
  'Functions',
  'Logarithms/Exponentials',
  'Analytical Geometry',
  'Plane Geometry',
  'Sets',
  'Statistics',
  'Numbers',
  'Trigonometry',
  'Problem solving',
]);

// Topics using real question bank only (no AI generation)
export const MOCK_ONLY_TOPICS = new Set([
  'Numerical reasoning',
  'Numerical Reasoning',
]);

// Topics where DeepSeek generates without verification (logic/language)
export const UNVERIFIED_TOPICS = new Set([
  'Probability',
  'Discrete Mathematics',
  'Critical thinking',
  'Reading comprehension',
]);

// ─── TYPES ───────────────────────────────────────────────────────────────────

export interface MathExtraction {
  equation: string;        // e.g. "x^2 - 4*x - 5"  (Nerdamer-compatible)
  constraint: string;      // e.g. "x > 0" or "" if none
  variable: string;        // e.g. "x" or "k" or "n"
  operation: 'solve' | 'evaluate' | 'simplify' | 'arithmetic';
  expected_form: 'exact' | 'decimal_2dp' | 'integer';
}

export interface VerificationResult {
  valid: boolean;
  correct_answer_letter: string | null;
  correct_answer_value: string | null;
  nerdamer_solution: string | null;
  error: string | null;
  options_checked: Record<string, { value: string; satisfies_constraint: boolean }>;
}

// ─── NERDAMER LOADER ──────────────────────────────────────────────────────────

let nerdamerLoaded = false;

async function loadNerdamer(): Promise<void> {
  if (nerdamerLoaded || typeof window === 'undefined') return;

  return new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).nerdamer) {
      nerdamerLoaded = true;
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/nerdamer.core.min.js';
    script.onload = () => {
      // Load algebra module
      const algebra = document.createElement('script');
      algebra.src = 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/Algebra.min.js';
      algebra.onload = () => {
        const calculus = document.createElement('script');
        calculus.src = 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/Calculus.min.js';
        calculus.onload = () => {
          const extra = document.createElement('script');
          extra.src = 'https://cdn.jsdelivr.net/npm/nerdamer@1.1.13/Extra.min.js';
          extra.onload = () => {
            nerdamerLoaded = true;
            resolve();
          };
          extra.onerror = reject;
          document.head.appendChild(extra);
        };
        calculus.onerror = reject;
        document.head.appendChild(calculus);
      };
      algebra.onerror = reject;
      document.head.appendChild(algebra);
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// ─── PRECISION HELPERS ────────────────────────────────────────────────────────

function normaliseValue(val: string, form: MathExtraction['expected_form']): string {
  const trimmed = val.trim().replace(/\s+/g, '');
  if (form === 'integer') {
    const n = parseFloat(trimmed);
    if (!isNaN(n) && Number.isInteger(n)) return String(n);
    return trimmed;
  }
  if (form === 'decimal_2dp') {
    const n = parseFloat(trimmed);
    if (!isNaN(n)) return n.toFixed(2);
    return trimmed;
  }
  // exact form — return as-is but normalise common representations
  return trimmed
    .replace(/\*\*(\d)/g, '^$1')  // Python ** to ^
    .replace(/sqrt\(/g, '√(')
    .replace(/\bsqrt(\d)/g, '√$1');
}

function valuesMatch(a: string, b: string, tolerance = 0.001): boolean {
  // Try exact string match first
  if (a.toLowerCase() === b.toLowerCase()) return true;

  // Try numeric match
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) {
    return Math.abs(na - nb) <= tolerance;
  }

  // Try normalised string match
  const normalA = a.replace(/\s/g, '').toLowerCase();
  const normalB = b.replace(/\s/g, '').toLowerCase();
  return normalA === normalB;
}

// ─── CONSTRAINT CHECKER ───────────────────────────────────────────────────────

function satisfiesConstraint(value: string, constraint: string, variable: string): boolean {
  if (!constraint || constraint.trim() === '') return true;

  const numVal = parseFloat(value);
  if (isNaN(numVal)) return true; // can't check non-numeric against inequality

  const c = constraint.trim();

  // Parse simple constraints: x > 0, x >= 1, x < 5, x != 0, x != 1
  const patterns = [
    { re: new RegExp(`${variable}\\s*>\\s*(-?[\\d.]+)`),  check: (v: number, t: number) => v > t },
    { re: new RegExp(`${variable}\\s*>=\\s*(-?[\\d.]+)`), check: (v: number, t: number) => v >= t },
    { re: new RegExp(`${variable}\\s*<\\s*(-?[\\d.]+)`),  check: (v: number, t: number) => v < t },
    { re: new RegExp(`${variable}\\s*<=\\s*(-?[\\d.]+)`), check: (v: number, t: number) => v <= t },
    { re: new RegExp(`${variable}\\s*!=\\s*(-?[\\d.]+)`), check: (v: number, t: number) => v !== t },
    { re: new RegExp(`${variable}\\s*<>\\s*(-?[\\d.]+)`), check: (v: number, t: number) => v !== t },
  ];

  for (const { re, check } of patterns) {
    const match = c.match(re);
    if (match) {
      const threshold = parseFloat(match[1]);
      if (!check(numVal, threshold)) return false;
    }
  }

  // Handle "x is positive" type constraints
  if (c.includes('positive') || c.includes('> 0')) return numVal > 0;
  if (c.includes('negative') || c.includes('< 0')) return numVal < 0;
  if (c.includes('integer') || c.includes('whole')) return Number.isInteger(numVal);

  return true; // unknown constraint — pass through
}

// ─── EXTRACT NUMERIC FROM OPTION STRING ───────────────────────────────────────

function extractOptionValue(optionText: string): string {
  // Remove "A) " prefix
  const withoutPrefix = optionText.replace(/^[A-E][).\s]+/, '').trim();

  // Handle LaTeX: \frac{a}{b} → a/b
  let cleaned = withoutPrefix
    .replace(/\\\(/g, '').replace(/\\\)/g, '')
    .replace(/\$\$/g, '').replace(/\$/g, '')
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^}]+)\}/g, 'sqrt($1)')
    .replace(/\\sqrt(\d)/g, 'sqrt($1)')
    .replace(/\^2/g, '^2')
    .trim();

  return cleaned;
}

// ─── CONSTRAINT CONSISTENCY CHECKER ─────────────────────────────────────────
// Checks that the extracted constraint plausibly appears in the question text.
// This is a programmatic guard — not relying on model self-consistency.

export function checkConstraintConsistency(
  questionText: string,
  extraction: MathExtraction
): { consistent: boolean; reason: string } {
  const constraint = extraction.constraint.trim();
  if (!constraint) return { consistent: true, reason: 'No constraint to check' };

  const qLower = questionText.toLowerCase();

  // Extract the numeric bound from the constraint e.g. "x > 3" → "3"
  const numMatch = constraint.match(/[-]?[\d.]+/);
  if (!numMatch) return { consistent: true, reason: 'Non-numeric constraint — cannot auto-check' };

  const boundValue = numMatch[0];
  const variable = extraction.variable;

  // Check 1: does the question mention the variable at all?
  if (!qLower.includes(variable.toLowerCase())) {
    return { consistent: false, reason: `Variable "${variable}" not found in question text` };
  }

  // Check 2: if the constraint has a non-zero, non-trivial bound, it should appear in question
  const bound = parseFloat(boundValue);
  if (bound !== 0 && bound !== 1 && bound !== -1) {
    if (!questionText.includes(boundValue)) {
      return {
        consistent: false,
        reason: `Constraint bound "${boundValue}" not found in question text — possible extraction mismatch`,
      };
    }
  }

  // Check 3: direction consistency — if question says "positive" constraint should be "> 0"
  if ((qLower.includes('positive') || qLower.includes('> 0')) && constraint.includes('< 0')) {
    return { consistent: false, reason: 'Constraint direction contradicts question text (positive vs < 0)' };
  }
  if ((qLower.includes('negative') || qLower.includes('< 0')) && constraint.includes('> 0')) {
    return { consistent: false, reason: 'Constraint direction contradicts question text (negative vs > 0)' };
  }

  return { consistent: true, reason: 'Constraint appears consistent with question text' };
}

// ─── MAIN VERIFICATION FUNCTION ───────────────────────────────────────────────

export async function verifyQuestion(
  options: string[],
  extraction: MathExtraction,
  claimedAnswer: string
): Promise<VerificationResult> {
  try {
    await loadNerdamer();
    const nerd = (window as any).nerdamer;

    if (!nerd) {
      return { valid: false, correct_answer_letter: null, correct_answer_value: null, nerdamer_solution: null, error: 'Nerdamer not loaded', options_checked: {} };
    }

    // Step 1: Solve the equation with Nerdamer
    let solutions: string[] = [];
    let nerdamerSolution = '';

    try {
      if (extraction.operation === 'solve') {
        // Solve equation for variable
        const equation = extraction.equation.includes('=')
          ? extraction.equation
          : `${extraction.equation} = 0`;

        const result = nerd.solve(equation, extraction.variable);
        const resultStr = nerd(result).toString();
        nerdamerSolution = resultStr;

        // Parse solutions — Nerdamer returns "[sol1,sol2]" or "sol1"
        if (resultStr.startsWith('[')) {
          solutions = resultStr.slice(1, -1).split(',').map((s: string) => s.trim());
        } else {
          solutions = [resultStr.trim()];
        }
      } else if (extraction.operation === 'arithmetic' || extraction.operation === 'evaluate') {
        const result = nerd(extraction.equation).evaluate();
        nerdamerSolution = result.toString();
        solutions = [nerdamerSolution];
      } else if (extraction.operation === 'simplify') {
        const result = nerd(extraction.equation).toString();
        nerdamerSolution = result;
        solutions = [result];
      }
    } catch (solveErr) {
      return {
        valid: false,
        correct_answer_letter: null,
        correct_answer_value: null,
        nerdamer_solution: null,
        error: `Nerdamer solve failed: ${solveErr}`,
        options_checked: {},
      };
    }

    // Step 2: Apply constraint to filter valid solutions
    const validSolutions = solutions.filter(sol =>
      satisfiesConstraint(sol, extraction.constraint, extraction.variable)
    );

    // Solution count validation — must have at least 1 valid solution
    if (validSolutions.length === 0) {
      return {
        valid: false,
        correct_answer_letter: null,
        correct_answer_value: null,
        nerdamer_solution: nerdamerSolution,
        error: `No solutions satisfy constraint "${extraction.constraint}" — all ${solutions.length} solutions filtered out`,
        options_checked: {},
      };
    }

    // Note: multiple valid solutions are OK at this stage — they mean the question
    // has multiple mathematical solutions (e.g. x = ±2). We still expect exactly ONE
    // option to match any of those solutions. This is validated in Step 4.

    // Step 3: Check every option
    const optionsChecked: VerificationResult['options_checked'] = {};
    const validOptions: string[] = [];

    for (const option of options) {
      const letter = option.charAt(0).toUpperCase();
      const rawValue = extractOptionValue(option);
      const normValue = normaliseValue(rawValue, extraction.expected_form);

      let satisfies = false;
      try {
        // Check if this option value matches any valid solution
        for (const sol of validSolutions) {
          const normSol = normaliseValue(sol, extraction.expected_form);
          if (valuesMatch(normValue, normSol)) {
            satisfies = true;
            break;
          }
          // Also try numeric evaluation via Nerdamer
          try {
            const optEval = parseFloat(nerd(rawValue).evaluate().toString());
            const solEval = parseFloat(nerd(sol).evaluate().toString());
            if (!isNaN(optEval) && !isNaN(solEval) && Math.abs(optEval - solEval) < 0.001) {
              satisfies = true;
              break;
            }
          } catch { /* ignore eval errors */ }
        }
      } catch { /* ignore */ }

      optionsChecked[letter] = { value: normValue, satisfies_constraint: satisfies };
      if (satisfies) validOptions.push(letter);
    }

    // Step 4: Validate exactly one correct option
    if (validOptions.length !== 1) {
      return {
        valid: false,
        correct_answer_letter: null,
        correct_answer_value: null,
        nerdamer_solution: nerdamerSolution,
        error: `Expected 1 valid option, found ${validOptions.length}: [${validOptions.join(', ')}]`,
        options_checked: optionsChecked,
      };
    }

    const correctLetter = validOptions[0];
    const correctValue = optionsChecked[correctLetter]?.value || '';

    return {
      valid: true,
      correct_answer_letter: correctLetter,
      correct_answer_value: correctValue,
      nerdamer_solution: nerdamerSolution,
      error: null,
      options_checked: optionsChecked,
    };

  } catch (err) {
    return {
      valid: false,
      correct_answer_letter: null,
      correct_answer_value: null,
      nerdamer_solution: null,
      error: `Verification error: ${err}`,
      options_checked: {},
    };
  }
}
