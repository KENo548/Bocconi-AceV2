// src/lib/taxonomy.ts
// The complete Bocconi syllabus taxonomy.
// 3 levels: Subject → Subtopic → Unit
// Used for: ingestion tagging, profile analysis, generation injection.
// NEVER inject the whole object into a prompt. Always slice to one topic.
 
export interface TaxonomyUnit {
  name: string;
  lowCoverage?: boolean; // marked true after analysis if < 2 appearances
}
 
export interface TaxonomySubtopic {
  name: string;
  units: string[];
}
 
export interface TaxonomyTopic {
  topic: string;           // must match SYLLABUS topic strings exactly
  subtopics: TaxonomySubtopic[];
}
 
export const TAXONOMY: TaxonomyTopic[] = [
 
  // ── MATHEMATICS ──────────────────────────────────────────────────────────
 
  {
    topic: 'Algebra',
    subtopics: [
      { name: 'Linear Equations and Inequalities', units: [
        'Single-variable linear equations',
        'Linear inequalities and solution sets',
        'Systems of two linear equations',
        'Systems mixing equations and inequalities',
        'Rearranging formulas to isolate variables',
        'Literal equations with parameters',
        'Word problems using linear relationships',
      ]},
      { name: 'Quadratic Equations', units: [
        'Solving by factoring',
        'Solving by quadratic formula',
        'Discriminant and nature of roots',
        'Quadratic inequalities',
        'Graph interpretation of quadratics',
        'Word problems involving quadratic relationships',
      ]},
      { name: 'Polynomials and Algebraic Expressions', units: [
        'Expanding algebraic expressions',
        'Simplifying expressions',
        'Factoring polynomials',
        'Algebraic fractions and simplification',
        'Polynomial identities',
      ]},
      { name: 'Factor and Remainder Theorems', units: [
        'Using P(a)=0 to identify factors',
        'Identifying roots of polynomials',
        'Polynomial factorization through known roots',
      ]},
      { name: 'Binomial Expansion', units: [
        'Expansion of (a+b)^n',
        'Finding specific coefficients',
        'Binomial coefficients',
      ]},
      { name: 'Radicals and Surds', units: [
        'Simplifying radicals',
        'Expanding expressions containing radicals',
        'Rationalizing denominators',
        'Operations with irrational numbers',
      ]},
      { name: 'Absolute Value', units: [
        'Absolute value equations',
        'Absolute value inequalities',
        'Graph interpretation of modulus functions',
      ]},
    ],
  },
 
  {
    topic: 'Functions',
    subtopics: [
      { name: 'Function Definition and Notation', units: [
        'Domain and range',
        'Evaluating functions',
        'Composite functions f(g(x))',
        'Inverse functions',
      ]},
      { name: 'Linear Functions', units: [
        'Slope and intercepts',
        'Point-slope and slope-intercept forms',
        'Interpreting linear graphs',
      ]},
      { name: 'Quadratic Functions', units: [
        'Standard form and vertex form',
        'Axis of symmetry',
        'Maximum and minimum values',
        'Graph interpretation',
      ]},
      { name: 'Function Identification', units: [
        'Finding function rules from tables of values',
        'Pattern recognition in functional relationships',
        'Determining unknown constants from known points',
      ]},
      { name: 'Even and Odd Functions', units: [
        'Algebraic symmetry tests',
        'f(-x)=f(x) and f(-x)=-f(x)',
      ]},
      { name: 'Rational Functions', units: [
        'Rational expressions',
        'Vertical and horizontal asymptotes',
        'Graph behavior',
      ]},
      { name: 'Piecewise and Modulus Functions', units: [
        'Piecewise definitions',
        'Interpreting non-standard graphs',
        'Modulus graphs',
      ]},
      { name: 'Exponential and Logarithmic Functions', units: [
        'Shape and growth behavior',
        'Graph interpretation',
        'Transformations',
      ]},
    ],
  },
 
  {
    topic: 'Logarithms/Exponentials',
    subtopics: [
      { name: 'Exponential Expressions', units: [
        'Laws of exponents',
        'Simplifying exponential expressions',
        'Solving exponential equations (same base)',
        'Exponential growth and decay word problems',
      ]},
      { name: 'Logarithm Definitions and Laws', units: [
        'Logarithmic definitions',
        'Converting exponential to logarithmic form',
        'Laws of logarithms (product, quotient, power)',
        'Change of base formula',
      ]},
      { name: 'Logarithmic Equations', units: [
        'Solving equations with logs',
        'Domain restrictions in log equations',
        'Equations requiring log laws to simplify',
      ]},
      { name: 'Logarithmic Estimation', units: [
        'Estimating log10 from number of digits',
        'Order-of-magnitude reasoning',
      ]},
    ],
  },
 
  {
    topic: 'Plane Geometry',
    subtopics: [
      { name: 'Triangles', units: [
        'Area and perimeter',
        'Pythagorean theorem',
        'Similar triangles',
        'Congruent triangles',
        'Special triangles (isosceles, equilateral)',
      ]},
      { name: 'Triangle Inequality', units: [
        'Determining possible side lengths',
        'Range of possible distances',
      ]},
      { name: 'Circles', units: [
        'Area and circumference',
        'Arc length and sector area',
        'Central and inscribed angles',
        'Tangent lines',
      ]},
      { name: 'Quadrilaterals and Polygons', units: [
        'Area and perimeter formulas',
        'Properties of parallelograms, rectangles, squares, trapezoids',
      ]},
      { name: 'Composite Figures', units: [
        'Areas of combined shapes',
        'Shaded region problems',
      ]},
      { name: 'Geometric Reasoning', units: [
        'Logical geometric deduction',
        'Coordinate-free reasoning',
      ]},
    ],
  },
 
  {
    topic: 'Analytical Geometry',
    subtopics: [
      { name: 'Lines in the Plane', units: [
        'Equation of a line (all forms)',
        'Parallel and perpendicular lines',
        'Distance between two points',
        'Distance from a point to a line',
      ]},
      { name: 'Midpoints and Segment Division', units: [
        'Midpoint formula',
        'Segment division in a given ratio',
      ]},
      { name: 'Symmetry and Transformations', units: [
        'Symmetry with respect to a point or axis',
        'Reflection across axes',
        'Coordinate transformations',
      ]},
      { name: 'Circles in the Plane', units: [
        'Equation of a circle',
        'Centre and radius from equation',
        'Line-circle intersection',
        'Tangency conditions',
      ]},
      { name: 'Parabolas', units: [
        'Equation of a parabola',
        'Vertex and graph interpretation',
        'Line-parabola intersections',
      ]},
      { name: 'Coordinate Geometry Applications', units: [
        'Area of polygons on coordinate plane',
        'Geometric interpretation of algebraic equations',
      ]},
    ],
  },
 
  {
    topic: 'Trigonometry',
    subtopics: [
      { name: 'Right Triangle Trigonometry', units: [
        'Definitions of sin, cos, tan',
        'Finding unknown sides',
        'Finding angles in right triangles',
      ]},
      { name: 'Trigonometric Identities', units: [
        'Fundamental identities (sin^2+cos^2=1 etc)',
        'Double angle formulas',
      ]},
      { name: 'Trigonometry in Triangles', units: [
        'Sine rule',
        'Cosine rule',
        'Triangle area formula (half ab sinC)',
      ]},
      { name: 'Trigonometric Equations', units: [
        'Solving simple trig equations within intervals',
      ]},
      { name: 'Trigonometric Graphs', units: [
        'Period, amplitude, phase shift',
        'Graph interpretation',
      ]},
    ],
  },
 
  {
    topic: 'Sets',
    subtopics: [
      { name: 'Set Notation', units: [
        'Membership, subsets, universal sets',
      ]},
      { name: 'Set Operations', units: [
        'Union, intersection, complement, set difference',
        'Symmetric difference (elements in exactly one set)',
      ]},
      { name: 'Counting Subsets', units: [
        'Total subsets 2^n',
        'Non-empty subsets 2^n - 1',
      ]},
      { name: 'Venn Diagram Problems', units: [
        'Two-set problems',
        'Three-set problems',
        'Inclusion-exclusion principle',
      ]},
      { name: 'Cartesian Product', units: [
        'Ordered pairs',
        'Cardinality rules',
      ]},
    ],
  },
 
  {
    topic: 'Discrete Mathematics',
    subtopics: [
      { name: 'Counting Principles', units: [
        'Multiplication principle',
        'Addition principle',
        'Complement counting',
      ]},
      { name: 'Permutations', units: [
        'Ordered arrangements without repetition',
        'Permutations with repetition',
        'Permutations with identical elements',
      ]},
      { name: 'Combinations', units: [
        'Selecting without order',
        'Restricted combinations',
        'Combinations with repetition',
      ]},
      { name: 'Distribution Problems', units: [
        'Stars and bars method',
        'Distributing identical objects into distinct groups',
      ]},
      { name: 'Pigeonhole Principle', units: [
        'Minimum guaranteed outcomes',
        'Worst-case reasoning',
      ]},
      { name: 'Sequences', units: [
        'Arithmetic sequences — nth term and sum',
        'Geometric sequences — nth term and sum',
        'Recursive sequences and recurrence relations',
      ]},
    ],
  },
 
  {
    topic: 'Numbers',
    subtopics: [
      { name: 'Integer Properties', units: [
        'Divisibility rules',
        'Prime numbers and prime factorization',
        'HCF and LCM',
        'Odd/even properties',
        'Consecutive integers',
      ]},
      { name: 'Fractions, Decimals, Percentages', units: [
        'Fraction arithmetic',
        'Percentage increase and decrease',
        'Reverse percentages',
      ]},
      { name: 'Ratio and Proportion', units: [
        'Direct and inverse proportion',
        'Scaling relationships',
      ]},
      { name: 'Units of Measure', units: [
        'Metric unit conversions',
        'Imperial-metric conversions',
        'Area unit conversions',
      ]},
      { name: 'Digit Reasoning', units: [
        'Number representation',
        'Exponent equations in number context',
      ]},
    ],
  },
 
  {
    topic: 'Probability',
    subtopics: [
      { name: 'Basic Probability', units: [
        'Probability of single events',
        'Complementary events',
        'Frequency interpretation',
      ]},
      { name: 'Combined Events', units: [
        'Independent events',
        'Mutually exclusive events',
        'Addition rule',
        'Multiplication rule',
      ]},
      { name: 'Conditional Probability', units: [
        'P(A|B) definition and calculation',
        'Basic Bayes reasoning',
      ]},
      { name: 'Combinatoric Probability', units: [
        'Counting-based probability',
        'At least one / at most one problems',
      ]},
      { name: 'Expected Value', units: [
        'Simple expected value calculations',
      ]},
    ],
  },
 
  {
    topic: 'Problem solving',
    subtopics: [
      { name: 'Rate Problems', units: [
        'Speed, distance, time',
        'Average speed',
        'Variable speed scenarios',
      ]},
      { name: 'Work Problems', units: [
        'Combined work rates',
        'Productivity calculations',
      ]},
      { name: 'Mixture Problems', units: [
        'Mixing solutions',
        'Alloy composition',
        'Concentration calculations',
      ]},
      { name: 'Financial Contexts', units: [
        'Simple and compound interest',
        'Profit, loss, discount',
        'Revenue and cost problems',
      ]},
      { name: 'Equation Modelling', units: [
        'Translating text into algebraic equations',
        'Multi-step word problems',
      ]},
      { name: 'Tournament and Competition Logic', units: [
        'Knockout tournament counting',
        'Round-robin competition counting',
        'Total matches calculation',
      ]},
    ],
  },
 
  {
    topic: 'Statistics',
    subtopics: [
      { name: 'Reading Graphs and Charts', units: [
        'Bar charts',
        'Line graphs',
        'Pie charts',
        'Histograms',
        'Tables and frequency distributions',
      ]},
      { name: 'Frequency Distributions', units: [
        'Reading grouped data',
        'Cumulative frequencies',
        'Conditional frequencies',
      ]},
      { name: 'Measures of Central Tendency', units: [
        'Mean from raw data or frequency table',
        'Median and mode',
        'Effect of adding or removing a data point on mean',
      ]},
      { name: 'Measures of Spread', units: [
        'Range',
        'Variance and standard deviation',
      ]},
      { name: 'Comparative Data Analysis', units: [
        'Comparing two distributions',
        'Conditional frequencies from two-way tables',
        'Cross-tabulation tables',
      ]},
    ],
  },
 
  // ── NON-MATHEMATICS ───────────────────────────────────────────────────────
 
  {
    topic: 'Numerical reasoning',
    subtopics: [
      { name: 'Data Sources', units: [
        'Single table',
        'Multiple related tables',
        'Bar chart (single or grouped)',
        'Line graph (single or multiple series)',
        'Pie chart',
        'Combined chart and table',
      ]},
      { name: 'Operations on Data', units: [
        'Percentage calculations',
        'Percentage change',
        'Percentage point differences',
        'Ratios and proportions from data',
        'Filtering data by condition',
      ]},
      { name: 'Multi-Step Calculations', units: [
        'Forecasts and projections',
        'Combined operations on data',
      ]},
      { name: 'Data Interpretation Traps', units: [
        'Row vs column confusion',
        'Absolute vs percentage change confusion',
        'Incorrect reference values',
        'Non-zero baseline on bar charts',
        'Scale and axis misreading',
      ]},
    ],
  },
 
  {
    topic: 'Critical thinking',
    subtopics: [
      { name: 'Formal Logic', units: [
        'Universal and existential quantifiers',
        'Negation of quantified statements',
        'If-then statements and contrapositive',
        'Necessary vs sufficient conditions',
        'Syllogistic reasoning',
        'Counterexamples',
        'Missing assumptions (hidden premises)',
        'Logical equivalence and De Morgan laws',
      ]},
      { name: 'Analytical Logic Puzzles', units: [
        'Truth and lie problems',
        'Ordering and ranking problems',
        'Spatial and seating logic',
        'Relational logic (height, comparisons)',
        'Kinship logic (family tree deductions)',
        'Categorical deduction',
        'Procedural and algorithmic logic',
      ]},
      { name: 'True / False / Cannot Be Deduced', units: [
        'Direct deduction from one statement',
        'Multi-step deduction combining statements',
        'Negation and contradiction identification',
        'Cannot-be-deduced identification',
        'Quantitative reasoning within argument',
        'Causal reasoning (correlation vs causation)',
      ]},
    ],
  },
 
  {
    topic: 'Reading comprehension',
    subtopics: [
      { name: 'Passage Types', units: [
        'Economics and business',
        'Science and technology',
        'Social sciences',
        'History and culture',
      ]},
      { name: 'Explicit Information', units: [
        'Direct factual retrieval',
        'Paraphrase recognition',
      ]},
      { name: 'Inference', units: [
        'Implicit meaning',
        'Logical conclusions from passage',
      ]},
      { name: 'Main Idea and Purpose', units: [
        'Central argument',
        "Author's purpose",
      ]},
      { name: 'Vocabulary in Context', units: [
        'Meaning from surrounding text',
      ]},
      { name: 'Tone and Attitude', units: [
        "Author's stance and tone",
      ]},
      { name: 'Structure', units: [
        'Organisation of arguments',
        'Role of specific paragraphs',
      ]},
    ],
  },
 
];
 
// ── Helper functions ────────────────────────────────────────────────────────
 
/** Get the taxonomy branch for one topic only. Used for surgical prompt injection. */
export function getTaxonomySlice(topic: string): TaxonomyTopic | null {
  return TAXONOMY.find(t => t.topic === topic) ?? null;
}
 
/** Render a taxonomy slice as a compact text block for prompt injection. */
export function renderTaxonomyForPrompt(topic: string): string {
  const slice = getTaxonomySlice(topic);
  if (!slice) return '';
  const lines: string[] = [`TAXONOMY FOR ${topic.toUpperCase()}:`];
  slice.subtopics.forEach(sub => {
    lines.push(`  Subtopic: ${sub.name}`);
    sub.units.forEach(u => lines.push(`    - ${u}`));
  });
  return lines.join('\n');
}
 
/** Get flat list of all unit names for a topic. Used in tagging prompts. */
export function getAllUnitsForTopic(topic: string): string[] {
  const slice = getTaxonomySlice(topic);
  if (!slice) return [];
  return slice.subtopics.flatMap(s => s.units);
}
 
/** Get subtopic name for a given unit string. */
export function getSubtopicForUnit(topic: string, unit: string): string | null {
  const slice = getTaxonomySlice(topic);
  if (!slice) return null;
  for (const sub of slice.subtopics) {
    if (sub.units.includes(unit)) return sub.name;
  }
  return null;
}