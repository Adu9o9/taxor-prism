'use client';

import { useState, DragEvent, ChangeEvent, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { UploadCloud, AlertCircle, CheckCircle, Sparkles, ArrowRight, BarChart2, RefreshCw } from 'lucide-react';
import { BackgroundLines } from "../../components/ui/background-lines";
import Link from 'next/link';

const LOADING_MESSAGES = [
  "Gemini 3.6 Flash is analyzing...",
  "Qwen 3.6 is calculating...",
  "Flash-Lite is extracting...",
  "Running hybrid Jaro-Winkler match...",
  "Normalizing dates...",
  "Finalizing evaluation metrics..."
];

export default function Page() {
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  
  // Zoho Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncSuccessId, setSyncSuccessId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Hydrate state from sessionStorage when navigating back to homepage
  useEffect(() => {
    try {
      const savedResults = sessionStorage.getItem('taxor_results');
      const savedPreview = sessionStorage.getItem('taxor_preview');
      const savedSyncId = sessionStorage.getItem('taxor_sync_id');

      if (savedResults) setResults(JSON.parse(savedResults));
      if (savedPreview) setPreviewImage(savedPreview);
      if (savedSyncId) setSyncSuccessId(savedSyncId);
    } catch (e) {
      console.error('Failed to restore session:', e);
    }
  }, []);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 2000); 
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleProcessFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file.');
      return;
    }

    try {
      setError(null);
      setLoading(true);
      setResults(null);
      setSyncSuccessId(null);
      setSyncError(null);

      const base64String = await fileToBase64(file);
      setPreviewImage(base64String);

      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64String }),
      });

      if (!response.ok) throw new Error(`API returned status: ${response.status}`);

      const data = await response.json();
      setResults(data);

      // Save state to sessionStorage
      sessionStorage.setItem('taxor_results', JSON.stringify(data));
      sessionStorage.setItem('taxor_preview', base64String);
      sessionStorage.removeItem('taxor_sync_id');
    } catch (err: any) {
      setError(err.message || 'An error occurred while evaluating the image.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSession = (e: React.MouseEvent) => {
    e.stopPropagation();
    sessionStorage.removeItem('taxor_results');
    sessionStorage.removeItem('taxor_preview');
    sessionStorage.removeItem('taxor_sync_id');
    setResults(null);
    setPreviewImage(null);
    setSyncSuccessId(null);
    setSyncError(null);
  };

  const handlePushToZoho = async () => {
    setIsSyncing(true);
    setSyncError(null);
    setSyncSuccessId(null);

    try {
      const rawData = getDisplayData(results, 'gemini_flash') || getDisplayData(results, 'gemini');
      const payload = rawData?.extracted || rawData;

      const res = await fetch('/api/evaluate/zoho', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error(`Server returned non-JSON response (${res.status}). Verify /api/evaluate/zoho endpoint.`);
      }

      const data = await res.json();
      
      if (res.ok && data.success) {
        setSyncSuccessId(data.expense_id);
        sessionStorage.setItem('taxor_sync_id', data.expense_id);
      } else {
        setSyncError(data.error || "Zoho sync failed.");
      }
    } catch (err: any) {
      setSyncError(err.message || "Failed to push to Zoho.");
    } finally {
      setIsSyncing(false);
    }
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleProcessFile(e.dataTransfer.files[0]);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleProcessFile(e.target.files[0]);
    }
  };

  const getDisplayData = (apiData: any, provider: string) => {
    if (!apiData) return {};
    if (apiData[provider]) return apiData[provider];
    if (apiData.data && apiData.data[provider]) return apiData.data[provider];
    if (apiData.results && apiData.results[provider]) return apiData.results[provider];
    return apiData; 
  };

  return (
    <>
      {/* Loading Overlay */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-2xl"
          >
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
              transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
              className="absolute w-96 h-96 bg-blue-600/30 rounded-full blur-[120px] -z-10"
            />
            
            <div className="h-16 relative w-full flex justify-center items-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={loadingStep}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                  className="text-3xl md:text-5xl font-medium text-white tracking-tight absolute text-center w-full drop-shadow-md"
                >
                  {LOADING_MESSAGES[loadingStep]}
                </motion.p>
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BackgroundLines className="min-h-screen w-full flex flex-col justify-start bg-black py-12 px-4 sm:px-6 lg:px-12 selection:bg-blue-500/30">
        <div className="max-w-[1400px] w-full mx-auto space-y-12 relative z-10">
          
          {/* Hero Section */}
          <div className="text-center space-y-5">
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-block"
            >
              <h1 className="text-5xl md:text-7xl font-extrabold tracking-tighter bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-500 pb-2 drop-shadow-sm">
                Taxor Prism
              </h1>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="space-y-2"
            >
              <p className="text-lg md:text-xl font-medium text-neutral-300 tracking-wide">
                Where unstructured chaos meets structured clarity.
              </p>
              <p className="text-sm text-neutral-500 max-w-xl mx-auto">
                Upload an unstructured Indian handwritten bill to benchmark extraction accuracy.
              </p>
            </motion.div>
          </div>

          <div className="max-w-2xl mx-auto">
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`
                relative flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-2xl cursor-pointer transition-all duration-300 ease-in-out backdrop-blur-sm
                ${isDragging 
                  ? 'border-blue-500 bg-blue-950/40 scale-[1.01] shadow-[0_0_30px_rgba(59,130,246,0.15)]' 
                  : 'border-neutral-800 bg-neutral-900/60 hover:bg-neutral-900/90 hover:border-neutral-700'}
              `}
            >
              <input type="file" ref={fileInputRef} onChange={onFileInputChange} accept="image/*" className="hidden" />
              
              {previewImage ? (
                <div className="flex flex-col items-center space-y-3">
                  <div className="relative w-36 h-36 rounded-xl overflow-hidden border border-neutral-700 shadow-xl group">
                    <img src={previewImage} alt="Preview" className="object-cover w-full h-full opacity-90 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <button 
                    onClick={handleResetSession}
                    className="inline-flex items-center space-x-1.5 text-xs font-medium text-neutral-400 hover:text-white bg-neutral-800/80 hover:bg-neutral-700 px-3 py-1.5 rounded-lg border border-neutral-700 transition-all"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Upload New Bill</span>
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center space-y-4 text-neutral-500">
                  <div className="p-4 bg-neutral-950/80 border border-neutral-800 rounded-full shadow-inner">
                    <UploadCloud className="w-8 h-8 text-blue-500" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-neutral-300">Click to upload or drag and drop</p>
                    <p className="text-xs text-neutral-500 mt-1">PNG, JPG, JPEG or WEBP</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-4 p-4 rounded-xl bg-red-950/50 backdrop-blur-md flex items-start space-x-3 text-red-400 border border-red-900/50">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </div>

          {results && !loading && (
            <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: 'easeOut' }} className="pt-12 border-t border-neutral-800/60">
              
              {/* Centered Results Header & Prominent CTA Button */}
              <div className="mb-10 text-center space-y-5">
                <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-white inline-block relative">
                  Model Benchmark Results
                  <div className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 w-1/3 h-1 bg-gradient-to-r from-transparent via-blue-500 to-transparent rounded-full opacity-80"></div>
                </h2>
                
                <div>
                  <Link 
                    href="/benchmark" 
                    className="inline-flex items-center space-x-3 bg-gradient-to-r from-blue-950/80 via-indigo-950/80 to-purple-950/80 hover:from-blue-900 hover:via-indigo-900 hover:to-purple-900 border border-blue-500/40 hover:border-blue-400 px-6 py-3 rounded-2xl transition-all duration-300 shadow-[0_0_25px_rgba(59,130,246,0.2)] hover:shadow-[0_0_35px_rgba(59,130,246,0.4)] group cursor-pointer"
                  >
                    <BarChart2 className="w-5 h-5 text-blue-400 group-hover:scale-110 transition-transform" />
                    <span className="text-sm md:text-base font-semibold text-blue-200 group-hover:text-white tracking-wide">
                      View Benchmark Methodology & Metrics
                    </span>
                    <ArrowRight className="w-4 h-4 text-blue-400 group-hover:translate-x-1.5 transition-transform" />
                  </Link>
                </div>
              </div>
              
              {/* 3-Column Layout */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                
                {/* 1. Gemini 3.6 Flash (The Winner) */}
                <div className="glowing-winner-wrapper flex flex-col shadow-[0_0_40px_rgba(59,130,246,0.1)] h-full rounded-2xl relative">
                  <div className="absolute -inset-[1px] bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 rounded-2xl opacity-20 blur-[2px]"></div>
                  
                  <div className="relative z-10 bg-[#0a0a0a]/90 backdrop-blur-xl flex-1 flex flex-col rounded-2xl overflow-hidden h-full border border-white/5">
                    <div className="bg-[#111111]/90 border-b border-white/10 px-5 py-3.5 flex justify-between items-center">
                      <div className="flex items-center space-x-2">
                        <div className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                        <span className="font-semibold text-sm text-white tracking-wide">Gemini 3.6 Flash</span>
                      </div>
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md">
                        <Sparkles className="w-3 h-3 mr-1" />
                        WINNER
                      </span>
                    </div>
                    <div className="p-5 flex-1 bg-[#0a0a0a]/50 overflow-x-auto text-sm text-emerald-400 font-mono leading-relaxed">
                      <pre><code>{JSON.stringify(getDisplayData(results, 'gemini_flash') || getDisplayData(results, 'gemini'), null, 2)}</code></pre>
                    </div>
                    <div className="p-4 bg-[#111111]/90 border-t border-white/10 flex flex-col justify-center">
                      {syncSuccessId ? (
                        <div className="flex items-center justify-center text-sm text-emerald-400 font-medium space-x-2 bg-emerald-950/50 border border-emerald-900/50 py-2.5 px-4 rounded-xl">
                          <CheckCircle className="w-4 h-4 text-emerald-400" />
                          <span>Synced to Zoho (ID: #{syncSuccessId.slice(-4)})</span>
                        </div>
                      ) : (
                        <button onClick={handlePushToZoho} disabled={isSyncing} className="w-full relative group overflow-hidden rounded-xl p-[1px] font-semibold text-sm transition-all duration-200 active:scale-[0.98]">
                          <span className="absolute inset-0 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 transition-all duration-300 group-hover:opacity-100 opacity-80"></span>
                          <span className="relative flex items-center justify-center space-x-2 px-4 py-2.5 bg-black hover:bg-transparent text-white rounded-[11px] transition-all duration-200">
                            {isSyncing ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                <span>Syncing...</span>
                              </>
                            ) : (
                              <>
                                <span>Push to Zoho Books</span>
                                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                              </>
                            )}
                          </span>
                        </button>
                      )}
                      {syncError && <p className="text-xs text-red-400 mt-2 text-center font-medium">{syncError}</p>}
                    </div>
                  </div>
                </div>

                {/* 2. Qwen 3.6 Column */}
                <div className="flex flex-col bg-[#0a0a0a]/90 backdrop-blur-xl rounded-2xl shadow-sm border border-neutral-800 overflow-hidden">
                  <div className="bg-[#111111]/90 border-b border-neutral-800 px-5 py-3.5 font-semibold text-sm flex items-center text-neutral-300">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mr-2.5 shadow-[0_0_8px_rgba(245,158,11,0.5)]"></div>
                    Qwen 3.6 / Groq
                  </div>
                  <div className="p-5 flex-1 bg-[#0a0a0a]/50 overflow-x-auto text-sm text-emerald-400/80 font-mono leading-relaxed">
                    <pre><code>{JSON.stringify(getDisplayData(results, 'llama_vision') || getDisplayData(results, 'claude'), null, 2)}</code></pre>
                  </div>
                </div>

                {/* 3. Gemini Flash-Lite Column */}
                <div className="flex flex-col bg-[#0a0a0a]/90 backdrop-blur-xl rounded-2xl shadow-sm border border-neutral-800 overflow-hidden">
                  <div className="bg-[#111111]/90 border-b border-neutral-800 px-5 py-3.5 font-semibold text-sm flex items-center text-neutral-300">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2.5 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                    Gemini Flash-Lite
                  </div>
                  <div className="p-5 flex-1 bg-[#0a0a0a]/50 overflow-x-auto text-sm text-emerald-400/80 font-mono leading-relaxed">
                    <pre><code>{JSON.stringify(getDisplayData(results, 'gemini_flash_lite') || getDisplayData(results, 'gpt4o'), null, 2)}</code></pre>
                  </div>
                </div>

              </div>
            </motion.div>
          )}
        </div>
      </BackgroundLines>
    </>
  );
}