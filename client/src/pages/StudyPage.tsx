import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  BookOpen, Plus, Trash2, FileText, Brain, HelpCircle, Layers,
  ChevronLeft, ChevronRight, RotateCcw, Check, X, Loader2,
  Save, Copy, ArrowLeft, Sparkles, GraduationCap, History, Clock,
} from "lucide-react";
import type { StudyNote, StudyOutput } from "@shared/schema";

type QuizQuestion = { q: string; options: string[]; answer: number; explanation: string };
type OutputData = { content?: string; questions?: QuizQuestion[]; cards?: { front: string; back: string }[] };

function formatDate(d: string | Date) {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function SummaryView({ data }: { data: OutputData }) {
  const { toast } = useToast();
  const text = data.content ?? "";
  const copy = () => { navigator.clipboard.writeText(text); toast({ description: "Copied!" }); };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" /> Summary
        </h3>
        <button onClick={copy} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded-lg hover:bg-muted/50 transition-all">
          <Copy className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
      <div className="rounded-xl border border-border bg-muted/20 p-5 text-sm text-foreground leading-relaxed whitespace-pre-wrap max-h-[60vh] overflow-y-auto">
        {text || <span className="text-muted-foreground italic">No content generated.</span>}
      </div>
    </div>
  );
}

function QuizView({ data }: { data: OutputData }) {
  const questions = data.questions ?? [];
  const [current, setCurrent] = useState(0);
  const [selected, setSelected] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);

  if (!questions.length) return <div className="text-sm text-muted-foreground italic py-8 text-center">No questions generated.</div>;

  const q = questions[current];
  const score = submitted ? questions.filter((qq, i) => selected[i] === qq.answer).length : 0;

  if (submitted && current === questions.length) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border bg-muted/20 p-8 text-center space-y-3">
          <div className="w-16 h-16 rounded-full bg-violet-500/15 flex items-center justify-center mx-auto">
            <GraduationCap className="w-8 h-8 text-violet-400" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{score}/{questions.length}</p>
            <p className="text-sm text-muted-foreground mt-1">{score === questions.length ? "Perfect score!" : score >= questions.length * 0.7 ? "Great job!" : "Keep studying!"}</p>
          </div>
        </div>
        <h3 className="text-sm font-semibold text-foreground">Review</h3>
        <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
          {questions.map((qq, i) => {
            const correct = selected[i] === qq.answer;
            return (
              <div key={i} className={cn("rounded-xl border p-4", correct ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5")}>
                <div className="flex items-start gap-2 text-sm font-medium text-foreground mb-2">
                  {correct ? <Check className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> : <X className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                  <span>{qq.q}</span>
                </div>
                <p className="text-xs text-muted-foreground ml-6">Correct: {qq.options[qq.answer]}</p>
                {qq.explanation && <p className="text-xs text-muted-foreground/70 ml-6 mt-1 italic">{qq.explanation}</p>}
              </div>
            );
          })}
        </div>
        <button onClick={() => { setSelected({}); setSubmitted(false); setCurrent(0); }} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all">
          <RotateCcw className="w-4 h-4" /> Retry Quiz
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" /> Question {current + 1} of {questions.length}</span>
        <div className="flex items-center gap-1">
          {questions.map((_, i) => (
            <div key={i} className={cn("w-1.5 h-1.5 rounded-full transition-all", i === current ? "bg-violet-400 w-3" : selected[i] !== undefined ? "bg-violet-400/40" : "bg-border")} />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-muted/20 p-5">
        <p className="text-sm font-semibold text-foreground mb-4">{q.q}</p>
        <div className="space-y-2">
          {q.options.map((opt, oi) => {
            const isSelected = selected[current] === oi;
            return (
              <button
                key={oi}
                data-testid={`button-quiz-option-${oi}`}
                onClick={() => !submitted && setSelected((s) => ({ ...s, [current]: oi }))}
                className={cn(
                  "w-full text-left text-sm px-4 py-3 rounded-lg border transition-all",
                  isSelected ? "border-violet-500 bg-violet-500/15 text-foreground" : "border-border hover:border-border/80 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="font-semibold mr-2">{["A", "B", "C", "D"][oi]}.</span>{opt}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setCurrent((c) => Math.max(0, c - 1))} disabled={current === 0} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-all">
          <ChevronLeft className="w-3.5 h-3.5" /> Prev
        </button>
        {current < questions.length - 1 ? (
          <button onClick={() => setCurrent((c) => c + 1)} disabled={selected[current] === undefined} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-all">
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button onClick={() => { setSubmitted(true); setCurrent(questions.length); }} disabled={Object.keys(selected).length < questions.length} className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 disabled:opacity-30 transition-all">
            <Check className="w-3.5 h-3.5" /> Submit Quiz
          </button>
        )}
      </div>
    </div>
  );
}

function FlashcardsView({ data }: { data: OutputData }) {
  const cards = data.cards ?? [];
  const [current, setCurrent] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  if (!cards.length) return <div className="text-sm text-muted-foreground italic py-8 text-center">No flashcards generated.</div>;

  const card = cards[current];
  const remaining = cards.length - known.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> Card {current + 1} of {cards.length}</span>
        <span className="text-emerald-400">{known.size} known · {remaining} remaining</span>
      </div>

      <button
        data-testid="button-flip-card"
        onClick={() => setFlipped((f) => !f)}
        className={cn(
          "w-full min-h-[200px] rounded-2xl border p-6 text-center cursor-pointer select-none transition-all duration-200 hover:shadow-md active:scale-[0.99]",
          flipped ? "border-violet-500/40 bg-violet-500/10" : "border-border bg-muted/20"
        )}
      >
        <div className="flex flex-col items-center justify-center h-full gap-3">
          <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground/60">{flipped ? "Answer" : "Question"}</p>
          <p className="text-base font-medium text-foreground leading-relaxed">{flipped ? card.back : card.front}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-2">Click to {flipped ? "see question" : "reveal answer"}</p>
        </div>
      </button>

      <div className="flex items-center gap-2">
        <button onClick={() => { setCurrent((c) => Math.max(0, c - 1)); setFlipped(false); }} disabled={current === 0} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-all">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => { setKnown((s) => new Set([...s, current])); setCurrent((c) => Math.min(cards.length - 1, c + 1)); setFlipped(false); }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-xs font-semibold hover:bg-emerald-500/20 transition-all"
        >
          <Check className="w-3.5 h-3.5" /> Know it
        </button>
        <button
          onClick={() => { setCurrent((c) => Math.min(cards.length - 1, c + 1)); setFlipped(false); }}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg border border-border text-muted-foreground text-xs font-semibold hover:bg-muted/50 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" /> Review later
        </button>
        <button onClick={() => { setCurrent((c) => Math.min(cards.length - 1, c + 1)); setFlipped(false); }} disabled={current === cards.length - 1} className="p-2 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-muted/50 disabled:opacity-30 transition-all">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <button onClick={() => { setKnown(new Set()); setCurrent(0); setFlipped(false); }} className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors">
        Reset progress
      </button>
    </div>
  );
}

export default function StudyPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [activeOutput, setActiveOutput] = useState<StudyOutput | null>(null);
  const [generating, setGenerating] = useState<"summary" | "quiz" | "flashcards" | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const { data: notes = [], isLoading: notesLoading } = useQuery<StudyNote[]>({
    queryKey: ["/api/study/notes"],
    enabled: !!user,
  });

  const { data: savedOutputs = [] } = useQuery<StudyOutput[]>({
    queryKey: ["/api/study/outputs"],
    enabled: !!user,
  });

  const noteOutputs = savedOutputs.filter(o => o.noteId === selectedNoteId);

  const deleteOutput = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/study/outputs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/study/outputs"] });
    },
  });

  const createNote = useMutation({
    mutationFn: () => apiRequest("POST", "/api/study/notes", { title: "Untitled Note", content: "" }),
    onSuccess: async (res) => {
      const note = await res.json() as StudyNote;
      await qc.invalidateQueries({ queryKey: ["/api/study/notes"] });
      loadNote(note);
    },
  });

  const saveNote = useMutation({
    mutationFn: ({ id, title, content }: { id: string; title: string; content: string }) =>
      apiRequest("PATCH", `/api/study/notes/${id}`, { title, content }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/study/notes"] });
      setIsDirty(false);
      toast({ description: "Note saved" });
    },
  });

  const deleteNote = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/study/notes/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/study/notes"] });
      if (selectedNoteId) { setSelectedNoteId(null); setNoteTitle(""); setNoteContent(""); setActiveOutput(null); }
    },
  });

  function loadNote(note: StudyNote) {
    setSelectedNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
    setIsDirty(false);
    setActiveOutput(null);
    setShowHistory(false);
  }

  async function handleGenerate(type: "summary" | "quiz" | "flashcards") {
    if (!noteContent.trim()) { toast({ description: "Add some notes content first", variant: "destructive" }); return; }
    setGenerating(type);
    setActiveOutput(null);
    try {
      let id = selectedNoteId;
      if (!id) {
        const res = await apiRequest("POST", "/api/study/notes", { title: noteTitle || "Untitled Note", content: noteContent });
        const note = await res.json() as StudyNote;
        id = note.id;
        setSelectedNoteId(id);
        qc.invalidateQueries({ queryKey: ["/api/study/notes"] });
      }
      const res = await apiRequest("POST", "/api/study/generate", { type, content: noteContent, noteId: id });
      const output = await res.json() as StudyOutput;
      setActiveOutput(output);
      setShowHistory(false);
      qc.invalidateQueries({ queryKey: ["/api/study/outputs"] });
    } catch (e) {
      toast({ description: `Failed to generate ${type}: ${(e as Error).message}`, variant: "destructive" });
    } finally {
      setGenerating(null);
    }
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-violet-500/15 flex items-center justify-center mx-auto">
            <GraduationCap className="w-8 h-8 text-violet-400" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">Sign in to use Studies</h2>
          <p className="text-sm text-muted-foreground">Create AI-powered summaries, quizzes, and flashcards from your notes.</p>
          <Link href="/login">
            <button className="px-6 py-2.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-500 transition-all">Sign In</button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Left sidebar — notes library */}
      <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-sidebar">
        <div className="flex items-center justify-between px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Link href="/">
              <button className="p-1 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all" title="Back to chat">
                <ArrowLeft className="w-4 h-4" />
              </button>
            </Link>
            <div className="flex items-center gap-1.5">
              <GraduationCap className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-foreground">Studies</span>
            </div>
          </div>
          <button
            onClick={() => createNote.mutate()}
            disabled={createNote.isPending}
            data-testid="button-new-note"
            title="New note"
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-all"
          >
            {createNote.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {notesLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
          ) : notes.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <BookOpen className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">No notes yet.</p>
              <p className="text-xs text-muted-foreground/60">Click + to create one.</p>
            </div>
          ) : (
            <div className="space-y-0.5 px-2">
              {notes.map((note) => (
                <div
                  key={note.id}
                  data-testid={`card-note-${note.id}`}
                  onClick={() => loadNote(note)}
                  className={cn(
                    "group relative rounded-lg px-3 py-2.5 cursor-pointer transition-all",
                    selectedNoteId === note.id ? "bg-violet-500/15 border border-violet-500/30" : "hover:bg-muted/50 border border-transparent"
                  )}
                >
                  <p className="text-xs font-medium text-foreground truncate pr-6">{note.title || "Untitled Note"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{note.content ? note.content.slice(0, 50) + "…" : "Empty note"}</p>
                  <p className="text-[10px] text-muted-foreground/50 mt-0.5">{formatDate(note.updatedAt)}</p>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (confirm("Delete this note?")) deleteNote.mutate(note.id); }}
                    data-testid={`button-delete-note-${note.id}`}
                    className="absolute top-2.5 right-2 p-0.5 rounded text-muted-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* ── Welcome screen — shown when nothing is open ── */}
        {!selectedNoteId && !noteContent.trim() ? (
          <div className="flex-1 overflow-y-auto">
            {/* Hero */}
            <div className="px-10 pt-12 pb-8 border-b border-border/40">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-violet-500/20 flex items-center justify-center">
                  <GraduationCap className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-foreground">AI Study Tools</h1>
                  <p className="text-xs text-muted-foreground">Powered by AI Sparky</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xl">
                Paste any study material — lecture notes, textbook passages, articles — and the AI will instantly transform it into structured study resources. Stop re-reading; start actively learning.
              </p>
            </div>

            {/* Feature cards */}
            <div className="px-10 py-8 grid grid-cols-3 gap-4 border-b border-border/40">
              {[
                {
                  icon: <FileText className="w-5 h-5 text-blue-400" />,
                  bg: "bg-blue-500/10",
                  border: "border-blue-500/20",
                  label: "Smart Summary",
                  desc: "Get a clean, structured overview of your notes with key headings and bullet points — perfect for fast review before an exam.",
                  badge: "text-blue-400",
                },
                {
                  icon: <HelpCircle className="w-5 h-5 text-amber-400" />,
                  bg: "bg-amber-500/10",
                  border: "border-amber-500/20",
                  label: "Practice Quiz",
                  desc: "10 multiple-choice questions generated from your notes. Answer one by one, get instant feedback, and see your score at the end.",
                  badge: "text-amber-400",
                },
                {
                  icon: <Layers className="w-5 h-5 text-emerald-400" />,
                  bg: "bg-emerald-500/10",
                  border: "border-emerald-500/20",
                  label: "Flashcard Deck",
                  desc: "15 flip cards for active memorization. Mark cards as \"Know it\" or \"Review later\" and track your progress through the deck.",
                  badge: "text-emerald-400",
                },
              ].map(({ icon, bg, border, label, desc }) => (
                <div key={label} className={cn("rounded-xl border p-4 space-y-3", bg, border)}>
                  <div className="flex items-center gap-2">
                    {icon}
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>

            {/* How it works */}
            <div className="px-10 py-8 border-b border-border/40">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-4">How it works</h2>
              <div className="flex items-start gap-8">
                {[
                  { step: "1", title: "Add your notes", desc: "Paste or type any study material into the editor — lectures, readings, or any text." },
                  { step: "2", title: "Choose a tool", desc: "Click Summary, Quiz, or Flashcards to generate that study format from your notes." },
                  { step: "3", title: "Study actively", desc: "Review your summary, take the quiz, or work through the flashcards to retain information." },
                ].map(({ step, title, desc }) => (
                  <div key={step} className="flex-1 flex items-start gap-3">
                    <div className="w-7 h-7 rounded-full bg-violet-500/20 border border-violet-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <span className="text-xs font-bold text-violet-400">{step}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-foreground">{title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick start */}
            <div className="px-10 py-8">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Quick start</h2>
              <div className="rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-4 space-y-3">
                <textarea
                  value={noteContent}
                  onChange={(e) => { setNoteContent(e.target.value); setIsDirty(true); }}
                  placeholder="Paste your notes here to get started…"
                  data-testid="textarea-note-content"
                  rows={5}
                  className="w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none border-none leading-relaxed"
                />
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => createNote.mutate()}
                    disabled={createNote.isPending}
                    data-testid="button-new-note"
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-violet-600 text-white text-xs font-semibold hover:bg-violet-500 transition-all"
                  >
                    {createNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    New note
                  </button>
                  <span className="text-[11px] text-muted-foreground">or select an existing note from the left sidebar</span>
                </div>
              </div>
            </div>
          </div>

        ) : (
          /* ── Editor + output view — shown when a note is open ── */
          <>
            {/* Header */}
            <div className="border-b border-border/60 px-6 py-3 flex items-center justify-between flex-shrink-0">
              <input
                value={noteTitle}
                onChange={(e) => { setNoteTitle(e.target.value); setIsDirty(true); }}
                placeholder="Note title…"
                data-testid="input-note-title"
                className="bg-transparent text-base font-semibold text-foreground placeholder:text-muted-foreground/40 outline-none border-none w-full max-w-md"
              />
              <div className="flex items-center gap-2">
                {isDirty && noteContent.trim() && (
                  <button
                    onClick={async () => {
                      if (selectedNoteId) {
                        saveNote.mutate({ id: selectedNoteId, title: noteTitle, content: noteContent });
                      } else {
                        const res = await apiRequest("POST", "/api/study/notes", { title: noteTitle || "Untitled Note", content: noteContent });
                        const note = await res.json() as StudyNote;
                        setSelectedNoteId(note.id);
                        setIsDirty(false);
                        qc.invalidateQueries({ queryKey: ["/api/study/notes"] });
                        toast({ description: "Note saved" });
                      }
                    }}
                    disabled={saveNote.isPending}
                    data-testid="button-save-note"
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-muted hover:bg-muted/80 text-foreground transition-all"
                  >
                    {saveNote.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                    {selectedNoteId ? "Save" : "Save as note"}
                  </button>
                )}
              </div>
            </div>

            {/* Split: editor left, output right */}
            <div className="flex-1 overflow-hidden flex gap-0">
              <div className="flex-1 flex flex-col overflow-hidden border-r border-border/40">
                <div className="flex-1 overflow-hidden p-4">
                  <textarea
                    value={noteContent}
                    onChange={(e) => { setNoteContent(e.target.value); setIsDirty(true); }}
                    placeholder="Paste your notes, lecture material, or any text here…"
                    data-testid="textarea-note-content"
                    className="w-full h-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground/40 outline-none border-none leading-relaxed"
                  />
                </div>
                <div className="border-t border-border/40 px-4 py-3 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-muted-foreground mr-1 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Generate:</span>
                  {(["summary", "quiz", "flashcards"] as const).map((type) => {
                    const icons = { summary: <FileText className="w-3.5 h-3.5" />, quiz: <HelpCircle className="w-3.5 h-3.5" />, flashcards: <Layers className="w-3.5 h-3.5" /> };
                    const labels = { summary: "Summary", quiz: "Quiz", flashcards: "Flashcards" };
                    const isGen = generating === type;
                    return (
                      <button
                        key={type}
                        onClick={() => handleGenerate(type)}
                        disabled={!!generating}
                        data-testid={`button-generate-${type}`}
                        className={cn(
                          "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
                          "border border-violet-500/30 bg-violet-500/10 text-violet-300 hover:bg-violet-500/20",
                          "disabled:opacity-40"
                        )}
                      >
                        {isGen ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : icons[type]}
                        {labels[type]}
                      </button>
                    );
                  })}
                  {noteContent.trim() && (
                    <span className="ml-auto text-[10px] text-muted-foreground/50">{noteContent.length.toLocaleString()} chars</span>
                  )}
                </div>
              </div>

              <div className="w-[420px] flex-shrink-0 flex flex-col overflow-hidden">
                {/* Right panel header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border/40 flex-shrink-0">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {showHistory ? `History (${noteOutputs.length})` : activeOutput ? activeOutput.type.charAt(0).toUpperCase() + activeOutput.type.slice(1) : "Output"}
                  </span>
                  <button
                    onClick={() => { setShowHistory(h => !h); }}
                    data-testid="button-toggle-history"
                    title={showHistory ? "Back to output" : "View history"}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-all",
                      showHistory
                        ? "bg-violet-500/20 text-violet-300"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    )}
                  >
                    <History className="w-3.5 h-3.5" />
                    {noteOutputs.length > 0 && !showHistory && (
                      <span className="ml-0.5 bg-violet-500/30 text-violet-300 rounded-full px-1.5 py-0 text-[10px]">{noteOutputs.length}</span>
                    )}
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5">
                  {showHistory ? (
                    /* History list */
                    noteOutputs.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                        <Clock className="w-8 h-8 text-muted-foreground/30" />
                        <p className="text-xs text-muted-foreground">No saved outputs for this note yet.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {[...noteOutputs].reverse().map((output) => {
                          const icons = { summary: <FileText className="w-3.5 h-3.5" />, quiz: <HelpCircle className="w-3.5 h-3.5" />, flashcards: <Layers className="w-3.5 h-3.5" /> };
                          const colors = { summary: "text-blue-400", quiz: "text-amber-400", flashcards: "text-green-400" };
                          return (
                            <div
                              key={output.id}
                              data-testid={`card-output-${output.id}`}
                              className="group flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 hover:bg-muted/40 px-3 py-2.5 transition-all"
                            >
                              <button
                                className="flex items-center gap-2.5 flex-1 text-left"
                                onClick={() => { setActiveOutput(output); setShowHistory(false); }}
                              >
                                <span className={colors[output.type as keyof typeof colors] ?? "text-muted-foreground"}>
                                  {icons[output.type as keyof typeof icons]}
                                </span>
                                <div>
                                  <p className="text-xs font-medium text-foreground capitalize">{output.type}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {new Date(output.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                  </p>
                                </div>
                              </button>
                              <button
                                onClick={() => deleteOutput.mutate(output.id)}
                                className="p-1 rounded text-muted-foreground/30 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                                data-testid={`button-delete-output-${output.id}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )
                  ) : generating ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-violet-500/15 flex items-center justify-center">
                        <Brain className="w-6 h-6 text-violet-400 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">Generating {generating}…</p>
                        <p className="text-xs text-muted-foreground mt-1">This takes a few seconds</p>
                      </div>
                    </div>
                  ) : activeOutput ? (
                    <div>
                      {activeOutput.type === "summary" && <SummaryView data={activeOutput.data as OutputData} />}
                      {activeOutput.type === "quiz" && <QuizView data={activeOutput.data as OutputData} />}
                      {activeOutput.type === "flashcards" && <FlashcardsView data={activeOutput.data as OutputData} />}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                      <Brain className="w-8 h-8 text-muted-foreground/30" />
                      <p className="text-xs text-muted-foreground leading-relaxed">Click <strong className="text-foreground">Summary</strong>, <strong className="text-foreground">Quiz</strong>, or <strong className="text-foreground">Flashcards</strong> below to generate from your notes.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
