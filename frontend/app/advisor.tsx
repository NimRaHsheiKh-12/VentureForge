"use client";

import { FormEvent, ReactNode, createContext, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useLanguage } from "./i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const ADVISOR_API_URL = `${API_BASE_URL}/advisor`;
const STORAGE_KEY = "ventureforge-advisor-session";
type AdvisorMessage = { role: "user" | "assistant"; content: string };
type AdvisorContextValue = {
  context: AdvisorContext;
  messages: AdvisorMessage[];
  conversationId: string;
  isOpen: boolean;
  isLoading: boolean;
  error: string;
  openAdvisor: () => void;
  closeAdvisor: () => void;
  updateContext: (context: Partial<AdvisorContext>) => void;
  setMessages: (messages: AdvisorMessage[]) => void;
  setConversationId: (id: string) => void;
  askAdvisor: (text: string) => Promise<void>;
};
type AdvisorContext = { businessIdea: string; location: string; budget: string; interests: string; analysis: string; finderIdeas: string };
const emptyContext: AdvisorContext = { businessIdea: "", location: "", budget: "", interests: "", analysis: "", finderIdeas: "" };
const AdvisorContextStore = createContext<AdvisorContextValue | null>(null);

export function AdvisorProvider({ children }: { children: ReactNode }) {
  const { language, t } = useLanguage();
  const [context, setContext] = useState<AdvisorContext>(emptyContext);
  const [messages, setMessages] = useState<AdvisorMessage[]>([]);
  const [conversationId, setConversationId] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const saved = JSON.parse(stored) as { context?: AdvisorContext; messages?: AdvisorMessage[]; conversationId?: string };
        setContext({ ...emptyContext, ...saved.context });
        setMessages(Array.isArray(saved.messages) ? saved.messages : []);
        setConversationId(typeof saved.conversationId === "string" ? saved.conversationId : "");
      }
    } catch { }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ context, messages, conversationId }));
  }, [context, messages, conversationId, loaded]);

  async function askAdvisor(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    const nextMessages = [...messages, { role: "user" as const, content: trimmed }];
    setError(""); setMessages(nextMessages); setIsLoading(true);
    const businessIdea = context.businessIdea || "No specific business selected yet";
    const location = context.location || "Not provided";
    const analysis = context.analysis || `No completed analysis is available yet. Finder ideas: ${context.finderIdeas || "None selected."}`;
    try {
      const result = await fetch(ADVISOR_API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: trimmed, business_idea: businessIdea, location, budget: context.budget || undefined, interests: context.interests || undefined, analysis, conversation_id: conversationId || undefined, history: messages, language }) });
      const data: { response?: unknown; conversation_id?: unknown } = await result.json().catch(() => ({}));
      if (!result.ok || typeof data.response !== "string" || !data.response.trim()) throw new Error(t("advisorUnavailable"));
      if (typeof data.conversation_id === "string") setConversationId(data.conversation_id);
      setMessages([...nextMessages, { role: "assistant", content: data.response.trim() }]);
    } catch { setError("AI Advisor is temporarily unavailable. Please try again shortly."); }
    finally { setIsLoading(false); }
  }

  const updateContext = useMemo(() => (next: Partial<AdvisorContext>) => setContext((current) => ({ ...current, ...next })), []);
  const value = useMemo(() => ({ context, messages, conversationId, isOpen, isLoading, error, openAdvisor: () => setIsOpen(true), closeAdvisor: () => setIsOpen(false), updateContext, setMessages, setConversationId, askAdvisor }), [context, messages, conversationId, isOpen, isLoading, error, updateContext, setMessages, setConversationId]);
  return <AdvisorContextStore.Provider value={value}>{children}<Advisor /></AdvisorContextStore.Provider>;
}

export function useAdvisorContext() {
  const value = useContext(AdvisorContextStore);
  if (!value) throw new Error("useAdvisorContext must be used inside AdvisorProvider");
  return value;
}

function Advisor() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const { context, messages, isOpen, openAdvisor, closeAdvisor, updateContext, askAdvisor, isLoading, error } = useAdvisorContext();
  const [question, setQuestion] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idea = params.get("idea");
    const location = params.get("location");
    const budget = params.get("budget");
    if (idea || location || budget) updateContext({ businessIdea: idea || context.businessIdea, location: location || context.location, budget: budget || context.budget });
  }, [pathname]);

  const page = pathname === "/finder" ? "finder" : context.analysis ? "analysis" : "planner";
  const suggestions = page === "finder" ? [t("advisorFinderQ1"), t("advisorFinderQ2"), t("advisorFinderQ3")] : page === "analysis" ? [t("advisorAnalysisQ1"), t("advisorAnalysisQ2"), t("advisorAnalysisQ3")] : [t("advisorPlannerQ1"), t("advisorPlannerQ2"), t("advisorPlannerQ3")];

  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void askAdvisor(question); setQuestion(""); }
  const chat = <div className="advisor-panel"><div className="advisor-heading"><div className="advisor-title-row"><span className="advisor-mark" aria-hidden="true">✦</span><div><p className="card-kicker">{t("advisorLabel")}</p><h2>{t("advisor")}</h2><p>{t("advisorSubtitle")}</p></div><button className="advisor-close" type="button" onClick={closeAdvisor} aria-label={t("closeAdvisor")}>×</button></div></div><div className="advisor-context">{context.businessIdea && <span>{context.businessIdea}</span>}{context.location && <span>{context.location}</span>}{context.budget && <span>{context.budget}</span>}</div><div className="advisor-conversation" aria-live="polite">{messages.length === 0 && !isLoading ? <div className="advisor-empty"><p>{t("askVenture")}</p><div className="advisor-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} onClick={() => void askAdvisor(suggestion)}>{suggestion}</button>)}</div></div> : messages.map((message, index) => <div className={`advisor-message advisor-message-${message.role}`} key={`${message.role}-${index}`}><span>{message.role === "user" ? "YOU" : "ADVISOR"}</span><p>{message.content}</p></div>)}{isLoading && <div className="advisor-message advisor-message-assistant advisor-typing"><span>ADVISOR</span><p><i /><i /><i /></p></div>}</div>{error && <p className="advisor-error" role="alert">{t("advisorUnavailable")}</p>}<form className="advisor-composer" onSubmit={handleSubmit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("askPlaceholder")} aria-label={t("askPlaceholder")} disabled={isLoading} /><button type="submit" disabled={isLoading || !question.trim()}>{isLoading ? t("thinking") : t("send")}</button></form></div>;
  return <><aside className={`advisor-dock ${isOpen ? "advisor-dock-open" : ""}`} aria-label={t("advisor")}>{chat}</aside><button className="advisor-launcher" type="button" onClick={openAdvisor} aria-label={t("openAdvisor")}>{t("advisor")} <span>↗</span></button>{isOpen && <button className="advisor-backdrop" type="button" aria-label={t("closeAdvisor")} onClick={closeAdvisor} />}</>;
}
