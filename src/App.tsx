import React, { useState } from 'react';
import Analysis from './pages/Analysis';
import PracticeSessions from './pages/PracticeSessions';
import PaperBuilder from './pages/PaperBuilder';
import Repository from './pages/Repository';
import Ingest from './pages/Ingest';
import ChatBot from './components/ChatBot';
import { BrainCircuit, BarChart2, PenTool, History as HistoryIcon, Bot, FileText, BookOpen, Database } from 'lucide-react';
import { useStore } from './store/useStore';

export default function App() {
  type Tab = 'analysis' | 'practice' | 'builder' | 'repository' | 'ingest';
  const [activeTab, setActiveTab] = useState<Tab>('practice');
  const { openChat } = useStore();

  return (
    <div className="min-h-screen bg-cream-bg text-old-ink font-sans selection:bg-muted-gold/30 selection:text-hunter-green">
      <header className="sticky top-0 z-40 bg-cream-card border-b border-old-border shadow-sm">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-hunter-green rounded-sm flex items-center justify-center shadow-inner">
                <BrainCircuit className="w-5 h-5 text-muted-gold" />
              </div>
              <h1 className="text-xl font-serif font-bold tracking-tight text-hunter-green">Bocconi Ace</h1>
            </div>

            <nav className="flex space-x-1 overflow-x-auto">
              <button
                onClick={() => setActiveTab('analysis')}
                className={`px-3 py-2 rounded-sm text-sm font-medium transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'analysis'
                  ? 'bg-hunter-green text-cream-bg'
                  : 'text-old-ink/70 hover:text-hunter-green hover:bg-cream-bg'
                  }`}
              >
                <BarChart2 className="w-4 h-4" />
                <span className="hidden sm:inline">Analysis</span>
              </button>
              <button
                onClick={() => setActiveTab('practice')}
                className={`px-3 py-2 rounded-sm text-sm font-medium transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'practice'
                  ? 'bg-hunter-green text-cream-bg'
                  : 'text-old-ink/70 hover:text-hunter-green hover:bg-cream-bg'
                  }`}
              >
                <PenTool className="w-4 h-4" />
                <span className="hidden sm:inline">Practice Sessions</span>
              </button>
              <button
                onClick={() => setActiveTab('builder')}
                className={`px-3 py-2 rounded-sm text-sm font-medium transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'builder'
                  ? 'bg-hunter-green text-cream-bg'
                  : 'text-old-ink/70 hover:text-hunter-green hover:bg-cream-bg'
                  }`}
              >
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Paper Builder</span>
              </button>
              <button
                onClick={() => setActiveTab('repository')}
                className={`px-3 py-2 rounded-sm text-sm font-medium transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'repository'
                  ? 'bg-hunter-green text-cream-bg'
                  : 'text-old-ink/70 hover:text-hunter-green hover:bg-cream-bg'
                  }`}
              >
                <BookOpen className="w-4 h-4" />
                <span className="hidden sm:inline">Repository</span>
              </button>
              <button
                onClick={() => setActiveTab('ingest')}
                className={`px-3 py-2 rounded-sm text-sm font-medium transition-colors flex items-center space-x-2 shrink-0 ${activeTab === 'ingest'
                  ? 'bg-hunter-green text-cream-bg'
                  : 'text-old-ink/70 hover:text-hunter-green hover:bg-cream-bg'
                  }`}
              >
                <Database className="w-4 h-4" />
                <span className="hidden sm:inline">Ingest Data</span>
              </button>

              <div className="w-px h-6 bg-old-border mx-2 self-center shrink-0"></div>
              <button
                onClick={() => openChat()}
                className="px-3 py-2 rounded-sm text-sm font-medium transition-colors flex items-center space-x-2 text-muted-gold hover:bg-cream-bg hover:text-hunter-green shrink-0"
              >
                <Bot className="w-4 h-4" />
                <span className="hidden sm:inline">Tutor</span>
              </button>
            </nav>
          </div>
        </div>
      </header>

      <main className={`mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full ${activeTab === 'builder' || activeTab === 'repository' ? 'max-w-[1600px]' : 'max-w-6xl'
        }`}>
        {activeTab === 'analysis' && <Analysis />}
        {activeTab === 'practice' && <PracticeSessions />}
        {activeTab === 'builder' && <PaperBuilder />}
        {activeTab === 'repository' && <Repository />}
        {activeTab === 'ingest' && <Ingest />}
      </main>

      <ChatBot />
    </div>
  );
}
