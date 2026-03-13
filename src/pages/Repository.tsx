import React, { useState } from 'react';
import { useStore, SavedPaper } from '../store/useStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/Card';
import { FileText, Trash2, Calendar, ArrowLeft, Download, Loader2 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import PaperSection from '../components/PaperSection';
import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

export default function Repository() {
  const { papers, deletePaper } = useStore();
  const [selectedPaper, setSelectedPaper] = useState<SavedPaper | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadPDF = async () => {
    if (!selectedPaper) return;

    try {
      setIsDownloading(true);

      const paperElement = document.querySelector('.print-container') || document.querySelector('.paper-page')?.parentElement;
      if (!paperElement) return;

      // Get all styles from the current document to ensure it looks exactly the same
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map(el => el.outerHTML)
        .join('\n');

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>${selectedPaper.name}</title>
          ${styles}
          <style>
            @media print {
              @page { size: A4; margin: 0; }
              body { background: white; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .print\\:hidden { display: none !important; }
              .paper-page { 
                margin: 0 !important; 
                box-shadow: none !important; 
                page-break-after: always; 
              }
              * {
                color: black !important;
              }
            }
          </style>
        </head>
        <body class="bg-white">
          <div class="print-container">
            ${paperElement.innerHTML}
          </div>
          <script>
            window.onload = () => {
              setTimeout(() => {
                window.print();
              }, 500);
            };
          </script>
        </body>
        </html>
      `;

      const blob = new Blob([htmlContent], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');

    } catch (error) {
      console.error("Failed to generate PDF", error);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setIsDownloading(false);
    }
  };

  if (papers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] space-y-4 text-center">
        <div className="w-16 h-16 bg-cream-card border border-old-border rounded-sm flex items-center justify-center">
          <FileText className="w-8 h-8 text-muted-gold" />
        </div>
        <div>
          <h2 className="text-xl font-serif font-semibold text-old-ink">No saved papers</h2>
          <p className="text-old-ink/70 max-w-sm mt-1">
            Build and save papers from the Paper Builder to see them here.
          </p>
        </div>
      </div>
    );
  }

  if (selectedPaper) {
    return (
      <div className="space-y-6 w-full max-w-[1600px] mx-auto">
        <div className="flex items-center justify-between border-b border-old-border pb-4 print:hidden">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="icon" onClick={() => setSelectedPaper(null)}>
              <ArrowLeft className="w-4 h-4 text-old-ink" />
            </Button>
            <div>
              <h2 className="text-2xl font-serif font-bold text-old-ink">{selectedPaper.name}</h2>
              <p className="text-old-ink/70 text-sm">
                Created on {new Date(selectedPaper.createdAt).toLocaleDateString()} • {selectedPaper.questions.length} Questions
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="text-hunter-green hover:bg-hunter-green/10 border-hunter-green/20"
              onClick={handleDownloadPDF}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {isDownloading ? 'Generating PDF...' : 'Download PDF'}
            </Button>
            <Button
              variant="outline"
              className="text-burgundy hover:bg-burgundy/10 hover:text-burgundy border-burgundy/20"
              onClick={() => {
                deletePaper(selectedPaper.id);
                setSelectedPaper(null);
              }}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Paper
            </Button>
          </div>
        </div>

        <div className="print-container">
          <PaperSection questions={selectedPaper.questions} paperName={selectedPaper.name} dateCreated={selectedPaper.createdAt} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-serif font-bold text-old-ink">Paper Repository</h2>
        <p className="text-old-ink/70">Access your saved custom practice papers.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {papers.map((paper) => (
          <Card key={paper.id} className="bg-cream-card border-old-border shadow-sm hover:border-muted-gold transition-colors">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg font-serif">{paper.name}</CardTitle>
                  <CardDescription className="flex items-center mt-1">
                    <Calendar className="w-3 h-3 mr-1" />
                    {new Date(paper.createdAt).toLocaleDateString()}
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="text-burgundy hover:bg-burgundy/10 hover:text-burgundy border-transparent"
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePaper(paper.id);
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm text-old-ink/70">
                <span className="font-medium bg-white px-2 py-1 rounded-sm border border-old-border">
                  {paper.questions.length} Questions
                </span>
                <Button variant="outline" size="sm" onClick={() => setSelectedPaper(paper)}>
                  View Paper
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
