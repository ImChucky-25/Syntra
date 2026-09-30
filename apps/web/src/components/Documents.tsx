import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type FileDto } from '../api';

type Task = 'summarize' | 'extract' | 'question';

interface AnalysisState {
  answer: string;
  model: string;
  task: string;
  filename: string;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

export default function Documents({ onBack }: { onBack: () => void }) {
  const [files, setFiles] = useState<FileDto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileDto | null>(null);
  const [task, setTask] = useState<Task>('summarize');
  const [question, setQuestion] = useState('');
  const [analysis, setAnalysis] = useState<AnalysisState | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await api.listFiles();
      setFiles(res.files);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(file: File): Promise<void> {
    setUploading(true);
    setError(null);
    try {
      await api.uploadFile(file);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await api.deleteFile(id);
      if (selected?.id === id) {
        setSelected(null);
        setAnalysis(null);
      }
      await refresh();
    } catch {
      /* ignore */
    }
  }

  async function analyze(): Promise<void> {
    if (!selected || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await api.analyzeDocument(selected.id, {
        task,
        ...(task === 'question' && question.trim() ? { question: question.trim() } : {}),
      });
      setAnalysis({
        answer: res.analysis.answer,
        model: res.analysis.model,
        task: res.analysis.task,
        filename: selected.filename,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  const statusBadge = (status: string) =>
    status === 'READY'
      ? 'bg-emerald-950/60 text-emerald-300'
      : status === 'FAILED'
        ? 'bg-red-950/60 text-red-300'
        : 'bg-amber-950/60 text-amber-300';

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Documents</h1>
          <p className="mt-1 text-sm text-slate-400">
            Upload PDF, DOCX, or text files (max 10 MB), then summarize, extract, or ask questions about them.
          </p>
        </div>
        <button
          onClick={onBack}
          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-800"
        >
          Back to chat
        </button>
      </div>

      <div className="mb-6 rounded-xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-center">
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.docx,.txt,.md,.csv,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
        >
          {uploading ? 'Uploading…' : 'Upload document'}
        </button>
        <p className="mt-2 text-xs text-slate-500">PDF · DOCX · TXT · MD · CSV · JSON — up to 10 MB</p>
      </div>

      {error && <div className="mb-4 rounded-lg bg-red-950/60 px-4 py-2 text-sm text-red-300">{error}</div>}

      <div className="space-y-2">
        {files.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No documents yet.</p>}
        {files.map((f) => (
          <div
            key={f.id}
            className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
              selected?.id === f.id ? 'border-indigo-500 bg-indigo-950/30' : 'border-slate-800 bg-slate-900/50'
            }`}
          >
            <button className="min-w-0 flex-1 text-left" onClick={() => { setSelected(f); setAnalysis(null); }}>
              <div className="truncate text-sm font-medium text-slate-100">{f.filename}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {fmtSize(f.sizeBytes)}
                {f.charCount !== null ? ` · ${f.charCount.toLocaleString()} chars` : ''}
              </div>
            </button>
            <div className="ml-3 flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-[10px] font-medium ${statusBadge(f.status)}`}>{f.status}</span>
              <button
                onClick={() => void remove(f.id)}
                className="text-slate-500 hover:text-red-400"
                aria-label={`Delete ${f.filename}`}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-200">Analyze “{selected.filename}”</h2>
          <div className="flex flex-wrap gap-2">
            {(['summarize', 'extract', 'question'] as Task[]).map((t) => (
              <button
                key={t}
                onClick={() => setTask(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize ${
                  task === t ? 'bg-indigo-600 text-white' : 'border border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          {task === 'question' && (
            <input
              className="mt-3 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              placeholder="Ask something about this document…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          )}
          <button
            onClick={() => void analyze()}
            disabled={analyzing || (task === 'question' && !question.trim())}
            className="mt-3 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-500 disabled:opacity-50"
          >
            {analyzing ? 'Analyzing…' : 'Run analysis'}
          </button>

          {analysis && (
            <div className="mt-4 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
              <div className="mb-2 text-xs text-slate-500">
                {analysis.task} · {analysis.model} · {analysis.filename}
              </div>
              <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200">{analysis.answer}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
