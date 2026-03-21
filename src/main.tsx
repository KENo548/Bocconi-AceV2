import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { StoreProvider } from './store/useStore.tsx';
import 'katex/dist/katex.min.css';
import './index.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "https://54b91b080cb9ccef9b27a6588e1fe7aa@o4511058630606848.ingest.de.sentry.io/4511058652627024",
  sendDefaultPii: import.meta.env.VITE_SENTRY_SEND_PII === 'true',
  environment: import.meta.env.MODE || 'development',
  release: import.meta.env.VITE_SENTRY_RELEASE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
  replaysOnErrorSampleRate: import.meta.env.MODE === 'production' ? 0.2 : 1.0,
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={<p>Something went wrong.</p>}>
      <StoreProvider>
        <TooltipProvider>
          <App />
        </TooltipProvider>
      </StoreProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>
);