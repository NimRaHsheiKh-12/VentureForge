"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAdvisorContext } from "../advisor";
import { LanguageSelector, useLanguage } from "../i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_URL = `${API_BASE_URL}/analyze`;
const scoreNames = ["Market Demand", "Market Gap", "Competition", "Financial Feasibility", "Risk Level"];
const scoreKeys = ["marketDemand", "marketGap", "competition", "financialFeasibility", "riskLevel"];
const sectionNames = ["Market Analysis", "Target Customers", "Competitors", "Market Gaps", "Startup Costs", "Pricing", "Opportunities", "Risks"];
const sectionKeys = ["marketAnalysis", "targetCustomers", "competitors", "marketGaps", "startupCosts", "pricing", "opportunities", "risksLabel"];
const loadingMessages = ["Researching the market", "Evaluating competitors", "Assessing financial feasibility", "Identifying risks", "Building your business analysis"];
const loadingKeys = ["researching", "evaluating", "assessing", "identifying", "building"];

function cleanKey(value: string) { return value.replace(/[\*#_:]/g, "").replace(/\s+/g, " ").trim().toLowerCase(); }
function parseSections(response: string) {
  const sections: Record<string, string> = {};
  const blocks = response.split(/\n(?=(?:#{1,4}\s|\*\*[^\n]+\*\*\s*$))/);
  blocks.forEach((block) => {
    const match = block.match(/^(?:#{1,4}\s+|\*\*)(.+?)(?:\*\*)?\s*\n([\s\S]*)$/);
    if (match) sections[cleanKey(match[1])] = match[2].trim();
  });
  return sections;
}
function getScore(response: string, name: string) {
  const normalizedResponse = response.replace(/\\([*_#`])/g, "$1");
  const label = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${label}[^\\d]*(\\d+(?:\\.\\d+)?)\\s*(?:/|out of)?\\s*10?`, "im");
  const match = normalizedResponse.match(regex);
  return match ? Number(match[1]) : null;
}
function getField(text: string, key: string) {
  return text.match(new RegExp(`(?:\\*\\*)?${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\*\\*)?\\s*:?\\s*([\\s\\S]*?)(?=\\n\\s*(?:\\*\\*|#{1,4}|[A-Z][A-Za-z ]{2,}:)|$)`, "i"))?.[1]?.trim() || "";
}
function formatText(text: string) { return text.replace(/\\([*_#`])/g, "$1").replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#{1,4}\s+/gm, "").trim(); }
function listItems(text: string) { return formatText(text).split(/\n+/).map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim()).filter(Boolean); }
function parsePhases(text: string) {
  const formatted = formatText(text);
  const phases = formatted.split(/\n(?=\d+[.)]\s+)/);
  return phases.map(phase => phase.replace(/^\s*\d+[.)]\s*/, "").trim()).filter(Boolean);
}

export default function Home() {
  const { updateContext, askAdvisor, openAdvisor } = useAdvisorContext();
  const { language, t } = useLanguage();
  const scoreLabels = scoreKeys.map((key) => t(key));
  const sectionLabels = sectionKeys.map((key) => t(key));
  const loadingLabels = loadingKeys.map((key) => t(key));
  const [businessIdea, setBusinessIdea] = useState("");
  const [location, setLocation] = useState("");
  const [budget, setBudget] = useState("");
  const [interests, setInterests] = useState("");
  const [response, setResponse] = useState("");
  const [roadmap, setRoadmap] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isRoadmapLoading, setIsRoadmapLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setBusinessIdea(params.get("idea") || ""); setLocation(params.get("location") || ""); setBudget(params.get("budget") || "");
  }, []);
  useEffect(() => { updateContext({ businessIdea, location, budget, interests, analysis: response }); }, [businessIdea, location, budget, interests, response, updateContext]);
  useEffect(() => { if (!isLoading) return; const timer = window.setInterval(() => setLoadingStep((step) => (step + 1) % loadingMessages.length), 1400); return () => window.clearInterval(timer); }, [isLoading]);

  const sections = useMemo(() => parseSections(response), [response]);
  const verdict = sections["final verdict"] || sections["verdict"] || response;
  const decision = getField(verdict, "Decision").match(/GO|MODIFY|NO-GO/i)?.[0].toUpperCase() || "";
  const verdictScore = getField(verdict, "Viability Score").match(/\d+(?:\.\d+)?/)?.[0] || "";
  const pivot = sections["recommended pivot"] || sections["recommendation"] || "";
  const gaps = sections["market gaps"] ? listItems(sections["market gaps"]) : [];
  const actionPlan = sections["action plan"] || sections["beginner action plan"] || "";
  const assumptions = sections["assumptions & missing information"] || sections["assumptions"] || "";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!businessIdea.trim() || !location.trim()) { setError(t("submitError")); return; }
    setError(""); setResponse(""); setRoadmap(""); setLoadingStep(0); setIsLoading(true);
    try {
      const payload: { business_idea: string; location: string; budget?: string; interests?: string; language: string } = { business_idea: businessIdea.trim(), location: location.trim(), language };
      if (budget.trim()) payload.budget = budget.trim();
      if (interests.trim()) payload.interests = interests.trim();
      const result = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!result.ok) throw new Error(result.status >= 500 ? t("unavailable") : t("requestFailed"));
      const data: { response?: unknown } = await result.json();
      if (typeof data.response !== "string" || !data.response.trim()) throw new Error(t("noResults"));
      setResponse(data.response);
    } catch (requestError) { setError(requestError instanceof TypeError ? t("noConnection") : requestError instanceof Error ? requestError.message : t("requestFailed")); }
    finally { setIsLoading(false); }
  }

  async function handleGenerateRoadmap() {
    setIsRoadmapLoading(true);
    setError("");
    try {
      const payload = { business_idea: businessIdea, location, budget: budget || undefined, interests: interests || undefined, analysis: response, language };
      const result = await fetch(`${API_BASE_URL}/roadmap`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!result.ok) throw new Error(t("advisorUnavailable"));
      const data: { response?: string } = await result.json();
      if (!data.response) throw new Error(t("advisorUnavailable"));
      setRoadmap(data.response);
    } catch { setError(t("advisorUnavailable")); }
    finally { setIsRoadmapLoading(false); }
  }

  function handleExplain(sectionName: string) {
    const prompt = `${t("advisorExplain")} ${sectionName}?`;
    openAdvisor();
    void askAdvisor(prompt);
  }

  return <main className="site-shell">
    <nav className="topbar"><Link className="brand" href="/"><span className="brand-mark">V</span><span>VentureForge</span></Link><div className="nav-links"><Link href="/">{t("home")}</Link><Link href="/finder">{t("finder")}</Link><Link className="active" href="/planner">{t("planner")}</Link><LanguageSelector /></div><span className="status-pill"><span className="status-dot" /> {t("online")}</span></nav>
    <section className={`hero ${response ? "hero-compact" : ""}`}><div className="hero-copy"><p className="eyebrow"><span /> {t("platform")}</p><h1 dangerouslySetInnerHTML={{ __html: t("plannerHero") }} /><p className="lede">{t("plannerLede")}</p></div><div className="signal-visual" aria-hidden="true"><div className="signal-ring ring-one" /><div className="signal-ring ring-two" /><span>VF</span><i /></div></section>
    <section className="workspace"><form className="analysis-form" onSubmit={handleSubmit}><div className="form-heading"><span className="step-number">01</span><div><p className="eyebrow">{t("plannerKicker")}</p><h2>{t("pressureTitle")}</h2></div></div><label>{t("idea")}<textarea value={businessIdea} onChange={(event) => setBusinessIdea(event.target.value)} placeholder={t("ideaPlaceholder")} rows={3} /></label><div className="form-row"><label>{t("location")}<input value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("locationPlaceholder")} /></label><label>{t("budget")}<input value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={t("budgetPlaceholder")} /></label></div><label>{t("interests")} <span className="optional">{t("optional")}</span><input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder={t("interestsPlaceholder")} /></label><button className="primary-button" type="submit" disabled={isLoading}>{isLoading ? <><span className="spinner" /> {t("loadingAnalyze")}</> : <>{t("analyze")} <span>→</span></>}</button>{error && <p className="error-message" role="alert">{error}</p>}<p className="form-note">{t("contextNote")}</p></form><div className="workspace-aside"><span className="aside-label">{t("whatExplore")}</span><div className="explore-list">{["demandSignals", "competition", "economics", "customerFit", "risks"].map((key, index) => <div key={key}><span>0{index + 1}</span>{t(key)}<b>↗</b></div>)}</div></div></section>
    {isLoading && <section className="loading-panel" aria-live="polite"><div className="loading-orbit"><span /></div><div><p className="eyebrow">{t("analyzing")}</p><h2>{loadingLabels[loadingStep]}</h2><p>{t("gathering")}</p><div className="loading-progress"><i style={{ width: `${((loadingStep + 1) / loadingMessages.length) * 100}%` }} /></div></div></section>}
    {response && <section className="results" aria-live="polite"><div className="results-header"><div><p className="eyebrow"><span /> ANALYSIS COMPLETE</p><h2>{businessIdea}</h2><p className="result-location">{location} {budget && <><span>•</span> {budget}</>}</p></div><span className="source-note">REAL RESEARCH RESPONSE</span></div><div className="result-hero"><div><p className="card-kicker">OVERALL VIABILITY</p><strong>{verdictScore || "—"}<small>/10</small></strong></div><div className="decision-lockup"><p className="card-kicker">DECISION</p><b className={`decision decision-${decision.toLowerCase()}`}>{decision || "IN REVIEW"}</b></div></div><div className="score-grid">{scoreNames.map((name) => { const score = getScore(response, name); return <div className="score-card" key={name}><span>{name}</span><strong>{score ?? "—"}<small>/10</small></strong><div className="score-track"><i style={{ width: `${score !== null ? score * 10 : 0}%` }} /></div></div>; })}</div><div className="insights-grid">{sectionNames.map((name) => { const text = sections[cleanKey(name)]; return text ? <article className="insight" key={name}><div className="insight-header"><p className="card-kicker">{name}</p><button className="why-button" onClick={() => handleExplain(name)}>Why?</button></div><div className="rich-text">{formatText(text)}</div></article> : null; })}</div>{gaps.length > 0 && <section className="feature-section"><div className="section-heading"><p className="card-kicker">THE OPENINGS</p><h2>Market gaps worth noticing</h2></div><div className="gap-grid">{gaps.map((gap, index) => <article className="gap-card" key={`${gap}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{gap}</p></article>)}</div></section>}{pivot && <section className="pivot-panel"><div><p className="card-kicker">ALTERNATIVE APPROACH</p><h2>Recommended pivot</h2></div><div className="pivot-flow"><span>{businessIdea}</span><b>↓</b><strong>{formatText(pivot)}</strong></div><p className="pivot-note">The final decision above evaluates the original idea. This pivot is an alternative path, not proof of viability.</p></section>}{actionPlan && <section className="feature-section"><div className="section-heading"><p className="card-kicker">BEGINNER ACTION PLAN</p><h2>What to do next</h2></div><div className="timeline">{listItems(actionPlan).map((step, index) => <div key={`${step}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><p>{step}</p></div>)}</div></section>}{assumptions && <article className="assumptions"><p className="card-kicker">ASSUMPTIONS &amp; MISSING INFORMATION</p><div className="rich-text">{formatText(assumptions)}</div></article>}<article className={`verdict verdict-${decision.toLowerCase()}`}><div className="verdict-top"><div><p className="card-kicker">FINAL VERDICT</p><h2>The signal is <strong>{decision || "IN REVIEW"}</strong></h2></div><div className="verdict-score"><span>Viability score</span><strong>{verdictScore || "—"}<small>/10</small></strong></div></div><div className="verdict-body">{["Why", "Biggest Opportunity", "Biggest Risk", "Next Step"].map((key) => <div key={key}><p className="card-kicker">{key}</p><p>{formatText(getField(verdict, key)) || "Not provided in the returned analysis."}</p></div>)}</div></article><details className="raw-response"><summary>View complete research response</summary><pre>{response}</pre></details></section>}
{!roadmap ? <section className="action-section"><button className="primary-button" onClick={handleGenerateRoadmap} disabled={isRoadmapLoading}>{isRoadmapLoading ? <><span className="spinner" /> {t("generatingRoadmap")}</> : t("generateRoadmap")}</button></section> : <section className="results roadmap-results" aria-live="polite"><div className="results-header"><h2>Business Roadmap</h2></div><div className="roadmap-timeline">{parsePhases(roadmap).map((phase, index) => <div className="roadmap-phase" key={index}><span className="phase-number">0{index + 1}</span><div className="phase-content" style={{ whiteSpace: "pre-wrap" }}>{phase}</div></div>)}</div></section>}
    <footer><span>VENTUREFORGE / 2026</span><span>Built for decisions, not guesses.</span></footer>
  </main>;
}
