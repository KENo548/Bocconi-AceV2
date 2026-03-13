import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { sendChatMessage } from '../services/groq';
import { sanitizeCurrency } from '../lib/constants';
import { X, Send, Loader2, Bot } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkBreaks from 'remark-breaks';
import rehypeKatex from 'rehype-katex';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function ChatBot() {
  const { isChatOpen, closeChat, chatContext } = useStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isActive = true;

    const fetchInitial = async () => {
      if (!isChatOpen || !chatContext) return;
      
      const initialMessage = `Please explain this question and its solution to me:\n\n${chatContext}`;
      setMessages([{ role: 'user', text: initialMessage }]);
      setIsLoading(true);

      try {
        const response = await sendChatMessage(initialMessage, [], chatContext);
        if (isActive) {
          setMessages([
            { role: 'user', text: initialMessage },
            { role: 'model', text: response }
          ]);
        }
      } catch (error) {
        console.error(error);
        if (isActive) {
          setMessages([
            { role: 'user', text: initialMessage },
            { role: 'model', text: "I apologize, but I encountered an error processing your request." }
          ]);
        }
      } finally {
        if (isActive) setIsLoading(false);
      }
    };

    fetchInitial();

    return () => {
      isActive = false; // Cleanup to prevent state updates if unmounted while fetching
    };
  }, [isChatOpen, chatContext]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const newMessages = [...messages, { role: 'user' as const, text: input }];

    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const lastUserMsg = newMessages[newMessages.length - 1].text;
      const historyWithoutLast = newMessages.slice(0, -1);
      const response = await sendChatMessage(lastUserMsg, historyWithoutLast, chatContext || undefined);
      setMessages([...newMessages, { role: 'model', text: response }]);
    } catch (error) {
      console.error(error);
      setMessages([...newMessages, { role: 'model', text: "I apologize, but I encountered an error processing your request." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      {isChatOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-6 right-6 w-96 h-[600px] bg-cream-card border border-old-border shadow-2xl rounded-sm flex flex-col z-50 overflow-hidden"
        >
          <div className="bg-hunter-green text-cream-bg p-4 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-muted-gold" />
              <h3 className="font-serif font-semibold text-lg">Elite Tutor Chat</h3>
            </div>
            <button onClick={closeChat} className="text-cream-bg/80 hover:text-cream-bg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-cream-bg/50">
            {messages.length === 0 && !isLoading && (
              <div className="text-center text-old-ink/60 mt-10 font-serif italic">
                How can I assist you with your preparation today?
              </div>
            )}
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] p-3 rounded-sm ${msg.role === 'user'
                  ? 'bg-hunter-green text-cream-bg'
                  : 'bg-white border border-old-border text-old-ink'
                  }`}>
                  <div className="prose prose-sm prose-stone max-w-none text-sm leading-relaxed font-sans">
                    <Markdown remarkPlugins={[remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
                      {sanitizeCurrency(msg.text)}
                    </Markdown>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white border border-old-border text-old-ink p-3 rounded-sm flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-gold" />
                  <span className="text-sm font-serif italic">Analyzing...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-old-border">
            <form onSubmit={(e) => { e.preventDefault(); handleSend(); }} className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question..."
                className="flex-1 bg-cream-bg border border-old-border rounded-sm px-3 py-2 text-sm focus:outline-none focus:border-muted-gold focus:ring-1 focus:ring-muted-gold transition-all"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="bg-hunter-green text-cream-bg px-3 py-2 rounded-sm hover:bg-hunter-green-hover disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
