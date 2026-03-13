import React, { useState, useRef, useEffect } from 'react';
import { GeneratedQuestion } from '../services/gemini';
import { sanitizeCurrency, MathText } from '../lib/constants';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';
import QuestionFigure from './QuestionFigure';

export default function PaperSection({ questions, paperName, dateCreated }: { questions: GeneratedQuestion[], paperName: string, dateCreated: number }) {
  return (
    // Scroll container — always shows both pages side by side without wrapping
    <div className="w-full overflow-x-auto">
      <div className="bg-old-ink/5 p-8 rounded-sm flex flex-row items-start justify-start gap-12 print:p-0 print:bg-transparent print:block" style={{ minWidth: '500mm' }}>
        <A4Document questions={questions} paperName={paperName} dateCreated={dateCreated} type="questions" />
        <A4Document questions={questions} paperName={paperName} dateCreated={dateCreated} type="solutions" />
      </div>
    </div>
  );
}

function A4Document({ questions, paperName, dateCreated, type }: { questions: GeneratedQuestion[], paperName: string, dateCreated: number, type: 'questions' | 'solutions' }) {
  const [heights, setHeights] = useState<number[]>([]);
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (measureRef.current) {
      setTimeout(() => {
        if (measureRef.current) {
          const newHeights = Array.from(measureRef.current.children)
            // Skip the first child because it's the header taking up space on page 1
            .slice(1)
            .map((child) => child.clientHeight);
          setHeights(newHeights);
        }
      }, 150);
    }
  }, [questions, paperName, type]);

  // A4 standard aspect: 210mm x 297mm. Using physical dimensions scaled down so it doesn't overflow
  // the usable height factors in 1-inch padding (~96px per inch top and bottom -> 192px total padding)
  // We leave a generous extra margin to account for page-break thresholds.
  const A4_USABLE_HEIGHT = 800;

  // We must calculate how much space the header takes up on the first page
  const headerHeight = measureRef.current?.children[0]?.clientHeight || 150;

  const pages: GeneratedQuestion[][] = [];
  let currentPage: GeneratedQuestion[] = [];
  let currentHeight = headerHeight;

  questions.forEach((q, i) => {
    // default to 200px conservative estimate if not measured yet
    const h = heights[i] || 200;

    if (currentHeight + h > A4_USABLE_HEIGHT && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [q];
      currentHeight = h;
    } else {
      currentPage.push(q);
      currentHeight += h;
    }
  });
  if (currentPage.length > 0 || questions.length === 0) {
    pages.push(currentPage);
  }

  const formattedDate = new Date(dateCreated).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric'
  });

  const PageHeader = () => (
    <div className="border-b-2 border-black pb-4 mb-8">
      <h1 className="text-2xl font-bold uppercase tracking-widest text-center" style={{ fontFamily: '"Cambria", "Computer Modern", serif' }}>
        {type === 'questions' ? paperName || 'Practice Paper' : 'Solutions'}
      </h1>
      <div className="flex justify-between items-center text-sm mt-4 font-semibold text-black/70">
        <span>Bocconi Ace</span>
        <span>{formattedDate}</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col space-y-8">
      {/* Hidden measurement container */}
      <div
        ref={measureRef}
        className="absolute invisible pointer-events-none bg-white print:hidden opacity-0"
        style={{ width: '210mm', padding: '1in' }}
      >
        <PageHeader />
        {questions.map((q, i) => (
          <div key={i} className="mb-0">
            {type === 'questions' ? <QuestionItem question={q} index={i} /> : <SolutionItem question={q} index={i} />}
          </div>
        ))}
      </div>

      {/* Actual A4 Pages */}
      {(() => {
        let globalQuestionCounter = 0;
        return pages.map((pageQuestions, pageIndex) => (
          <div
            key={pageIndex}
            className="bg-white shadow-xl relative shrink-0 print:shadow-none print:break-after-page print:mx-auto overflow-hidden"
            style={{ width: '210mm', height: '297mm', padding: '1in', boxSizing: 'border-box' }}
          >
            {pageIndex === 0 && <PageHeader />}

            {pageQuestions.length === 0 && pageIndex === 0 && (
              <div className="h-full flex items-center justify-center text-black/40 italic print:hidden" style={{ fontFamily: '"Cambria", "Computer Modern", serif', fontSize: '12pt' }}>
                Blank Layout
              </div>
            )}

            {pageQuestions.map((q) => {
              const globalIndex = globalQuestionCounter++;
              return (
                <div key={globalIndex} className="mb-0">
                  {type === 'questions' ? <QuestionItem question={q} index={globalIndex} /> : <SolutionItem question={q} index={globalIndex} />}
                </div>
              );
            })}

            <div className="absolute bottom-6 left-0 right-0 text-center text-sm text-black/40 print:hidden" style={{ fontFamily: '"Cambria", "Computer Modern", serif' }}>
              Page {pageIndex + 1}
            </div>
          </div>
        ));
      })()}
    </div>
  );
}

function QuestionItem({ question, index }: { question: GeneratedQuestion, index: number }) {
  return (
    <div className="text-black text-left border-b border-black/10 pb-6 mb-6 last:border-0 last:pb-0 last:mb-0" style={{ fontFamily: '"Cambria", "Computer Modern", serif', fontSize: '11pt', lineHeight: '1.6' }}>
      <div className="flex items-start mb-4">
        <span className="font-bold mr-3 mt-0.5">{index + 1}.</span>
        <div className="prose max-w-none leading-relaxed text-black [&_*]:text-black overflow-hidden break-words w-full" style={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
          <Markdown remarkPlugins={[remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
            {sanitizeCurrency(question.question)}
          </Markdown>
          {question.chartData && (
            <div className="my-6">
              <QuestionFigure chartData={question.chartData} />
            </div>
          )}
        </div>
      </div>
      <div className="pl-7 space-y-2.5">
        {question.options.map((opt, i) => (
          <div key={i} className="flex items-start">
            <span className="font-medium mr-3 mt-0.5">{opt.charAt(0)})</span>
            <div className="prose max-w-none leading-relaxed text-black [&_*]:text-black overflow-hidden break-words" style={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
              <Markdown remarkPlugins={[remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
                {sanitizeCurrency(opt.substring(3))}
              </Markdown>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SolutionItem({ question, index }: { question: GeneratedQuestion, index: number }) {
  // AI sometimes outputs display math `$$...$$` inline with text (no newlines).
  // remark-math requires $$ blocks to be clearly separated by newlines to render as display math.
  // We also use MathText so stray \times or \div get automatically wrapped in inline $...$
  const formattedExplanation = question.explanation
    // Ensure display math blocks have double newlines before and after
    .replace(/([^\n])\s*\$\$(.*?)\$\$\s*([^\n])/g, '$1\n\n$$$$$2$$$$\n\n$3')
    .replace(/(^\s*|\n)\s*\$\$(.*?)\$\$\s*([^\n])/g, '$1$$$$$2$$$$\n\n$3')
    .replace(/([^\n])\s*\$\$(.*?)\$\$\s*(\n|$)/g, '$1\n\n$$$$$2$$$$$3');

  return (
    <div className="text-black text-left border-b border-black/10 pb-6 mb-6 last:border-0 last:pb-0 last:mb-0" style={{ fontFamily: '"Cambria", "Computer Modern", serif', fontSize: '11pt', lineHeight: '1.8' }}>
      <div className="flex items-start mb-3">
        <span className="font-bold mr-3 mt-0.5">Q{index + 1}.</span>
        <span className="font-bold">Correct Answer: {question.correctAnswer}</span>
      </div>
      <div className="pl-4 prose max-w-none text-black [&_*]:text-black [&_.katex]:text-black overflow-hidden" style={{ fontFamily: 'inherit', fontSize: 'inherit' }}>
        <MathText>{formattedExplanation}</MathText>
      </div>
    </div>
  );
}
