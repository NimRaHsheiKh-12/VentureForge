"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useAdvisorContext } from "../advisor";
import { LanguageSelector, useLanguage } from "../i18n";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
const API_URL = `${API_BASE_URL}/finder/recommend`;
type Recommendation = { business_name: string; short_description: string; why_it_fits: string; estimated_startup_budget: string; target_customer: string; business_model: string; first_validation_step: string; risk_level: string; planner_query: string };

export default function FinderPage() {
  const { updateContext } = useAdvisorContext();
  const { language, t } = useLanguage();
  const [budget, setBudget] = useState("");
  const [location, setLocation] = useState("");
  const [interests, setInterests] = useState("");
  const [skills, setSkills] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { publishFinderContext(); }, [budget, location, interests, recommendations]);

  function publishFinderContext(nextRecommendations: Recommendation[] = recommendations) {
    updateContext({ budget, location, interests, finderIdeas: nextRecommendations.map((recommendation) => `${recommendation.business_name}: ${recommendation.short_description}`).join("\n") });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    publishFinderContext([]);
    setError(""); setRecommendations([]); setIsLoading(true);
    try {
      const result = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ budget: budget.trim(), location: location.trim(), interests: interests.trim(), skills: skills.trim(), business_type: businessType.trim(), language }) });
      const data: { recommendations?: Recommendation[]; detail?: string } = await result.json().catch(() => ({}));
      if (!result.ok) throw new Error(result.status === 429 ? t("finderBusy") : typeof data.detail === "string" ? data.detail : t("requestFailed"));
      if (!Array.isArray(data.recommendations) || data.recommendations.length === 0) throw new Error(t("noResults"));
      setRecommendations(data.recommendations);
      publishFinderContext(data.recommendations);
    } catch (requestError) { setError(requestError instanceof TypeError ? t("noConnection") : requestError instanceof Error ? requestError.message : t("somethingWrong")); }
    finally { setIsLoading(false); }
  }

  return <main className="site-shell finder-page">
    <nav className="topbar"><Link className="brand" href="/"><span className="brand-mark">V</span><span>VentureForge</span></Link><div className="nav-links"><Link href="/">{t("home")}</Link><Link className="active" href="/finder">{t("finder")}</Link><Link href="/planner">{t("planner")}</Link><LanguageSelector /></div><span className="status-pill"><span className="status-dot" /> {t("discovery")}</span></nav>
    <section className="finder-hero"><div><p className="eyebrow"><span /> {t("finderKicker")}</p><h1 dangerouslySetInnerHTML={{ __html: t("finderHero") }} /><p className="lede">{t("guidedDiscovery")}</p></div><div className="finder-animation signal-visual" aria-label="VentureForge intelligence animation"><div className="signal-ring ring-one" /><div className="signal-ring ring-two" /><span>VF</span><i /></div></section>
    <section className="finder-grid"><form className="finder-form" onSubmit={handleSubmit}><div className="form-heading"><span className="step-number">01</span><div><p className="eyebrow">{t("yourStartingPoint")}</p><h2>{t("tellWork")}</h2></div></div><label>{t("budget")}<input required value={budget} onChange={(event) => setBudget(event.target.value)} placeholder={t("budgetFinderPlaceholder")} /></label><label>{t("location")}<input required value={location} onChange={(event) => setLocation(event.target.value)} placeholder={t("locationFinderPlaceholder")} /></label><label>{t("interests")}<input value={interests} onChange={(event) => setInterests(event.target.value)} placeholder={t("interestsFinderPlaceholder")} /></label><label>{t("skills")}<input value={skills} onChange={(event) => setSkills(event.target.value)} placeholder={t("skillsPlaceholder")} /></label><label>{t("businessType")} <span className="optional">{t("optional")}</span><input value={businessType} onChange={(event) => setBusinessType(event.target.value)} placeholder={t("businessTypePlaceholder")} /></label><button className="primary-button" type="submit" disabled={isLoading}>{isLoading ? <><span className="spinner" /> {t("loadingFind")}</> : <>{t("findIdeas")} <span>→</span></>}</button>{error && <p className="error-message" role="alert">{error}</p>}</form><aside className="finder-brief"><p className="card-kicker">{t("generatedIdeas")}</p><h2>{t("recommendations")}</h2><p>{t("generatedNote")}</p><div className="endpoint-note"><span>{t("connected")}</span><code>POST /finder/recommend</code></div></aside></section>
    {recommendations.length > 0 && <section className="recommendations"><div className="section-heading"><p className="card-kicker">{t("shortlist")}</p><h2>{t("shortlistTitle")}</h2></div><div className="recommendation-grid">{recommendations.map((recommendation) => <article className="recommendation-card" key={recommendation.business_name}><div className="recommendation-title"><h3>{recommendation.business_name}</h3><span>{recommendation.risk_level}</span></div><p>{recommendation.short_description}</p><dl><div><dt>{t("whyFits")}</dt><dd>{recommendation.why_it_fits}</dd></div><div><dt>{t("startupBudget")}</dt><dd>{recommendation.estimated_startup_budget}</dd></div><div><dt>{t("targetCustomer")}</dt><dd>{recommendation.target_customer}</dd></div><div><dt>{t("businessModel")}</dt><dd>{recommendation.business_model}</dd></div><div><dt>{t("firstValidation")}</dt><dd>{recommendation.first_validation_step}</dd></div></dl><Link className="planner-link" href={`/planner?idea=${encodeURIComponent(recommendation.planner_query)}&location=${encodeURIComponent(location)}&budget=${encodeURIComponent(budget)}`}>{t("analyzeThis")} <span>→</span></Link></article>)}</div></section>}
    <section className="finder-next"><p className="eyebrow"><span /> {t("whenAvailable")}</p><div className="flow"><div><span>01</span><strong>{t("finder")}</strong><small>{t("capture")}</small></div><b>→</b><div><span>02</span><strong>{t("selectBusiness")}</strong><small>{t("reviewRecommendations")}</small></div><b>→</b><div><span>03</span><strong>{t("planner")}</strong><small>{t("analyzeIdea")}</small></div></div></section>
    <footer><span>VENTUREFORGE / 2026</span><span>{t("discoveryWithout")}</span></footer>
  </main>;
}
