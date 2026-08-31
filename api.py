import json
import logging
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google.adk.agents.llm_agent import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel, Field, field_validator

from ventureforge_agent.agent import root_agent


APP_NAME = "ventureforge"
logger = logging.getLogger(__name__)
session_service = InMemorySessionService()
runner = Runner(
    agent=root_agent,
    app_name=APP_NAME,
    session_service=session_service,
)
finder_agent = Agent(
    model="gemini-3.5-flash",
    name="ventureforge_finder",
    description="Generates business idea recommendations from founder constraints.",
    instruction=(
        "You generate business idea recommendations from a founder's budget, location, "
        "interests, skills, and preferred business type. Return ONLY valid JSON with a "
        "top-level object containing a 'recommendations' array of 3 to 5 objects. Each "
        "object must contain exactly these string fields: business_name, short_description, "
        "why_it_fits, estimated_startup_budget, target_customer, business_model, "
        "first_validation_step, risk_level, planner_query. Generate ideas, not researched "
        "facts. Do not claim that budgets, demand, competitors, or customer counts are "
        "confirmed. Use the user's location and budget as constraints, and make planner_query "
        "a concise business idea suitable for the existing /analyze endpoint. Never return "
        "markdown or commentary outside the JSON object. The user prompt includes a response "
        "language; write every user-facing recommendation value naturally in that language, "
        "while keeping the JSON field names unchanged."
    ),
)
finder_runner = Runner(
    agent=finder_agent,
    app_name=APP_NAME,
    session_service=session_service,
)
advisor_agent = Agent(
    model="gemini-3.5-flash",
    name="ventureforge_advisor",
    description="Answers follow-up questions about a user's current venture analysis and generates business roadmaps.",
    instruction=(
        "You are the VentureForge AI Advisor. Answer follow-up questions specifically "
        "about the venture analysis included in the user's messages. Use the provided "
        "business idea, location, budget, interests, and analysis as the source of truth. "
        "Explain scores and recommendations using the actual analysis, distinguish research "
        "from estimates and assumptions, and keep continuity with earlier messages. Do not "
        "invent facts, costs, scores, or research. If the analysis does not contain enough "
        "information, say what is missing and suggest a practical way to validate it. Be "
        "concise, direct, and useful to a first-time founder.\n\n"
        "When asked to generate a 'Business Roadmap', create a practical, "
        "entrepreneur-focused roadmap with clear phases (e.g., Validate, Plan, Setup, "
        "Launch, First 30 Days, Growth) specific to the provided analysis, location, "
        "and budget. Each phase should have clear actionable tasks, priorities, "
        "practical guidance, relevant risks, and next steps.\n\n"
        "Return plain text only. The user prompt includes a response language; "
        "write the complete reply naturally in that language."
    ),
)
advisor_runner = Runner(
    agent=advisor_agent,
    app_name=APP_NAME,
    session_service=session_service,
)

app = FastAPI(title="VentureForge API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["POST"],
    allow_headers=["*"],
)


class AnalyzeRequest(BaseModel):
    business_idea: str = Field(min_length=1)
    location: str = Field(min_length=1)
    budget: str | None = Field(default=None, max_length=300)
    interests: str | None = Field(default=None, max_length=1000)
    language: str = Field(default="en", pattern="^(en|ur|ar)$")


class FinderRequest(BaseModel):
    budget: str = Field(min_length=1)
    location: str = Field(min_length=1)
    interests: str = Field(default="", max_length=1000)
    skills: str = Field(default="", max_length=1000)
    business_type: str = Field(default="", max_length=300)
    language: str = Field(default="en", pattern="^(en|ur|ar)$")

    @field_validator("budget")
    @classmethod
    def budget_must_contain_amount(cls, value: str) -> str:
        if not any(character.isdigit() for character in value):
            raise ValueError("Budget must include an amount.")
        return value.strip()

    @field_validator("location")
    @classmethod
    def location_must_not_be_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Location is required.")
        return value.strip()


class AdvisorMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=10000)


class AdvisorRequest(BaseModel):
    question: str | None = Field(default=None, max_length=2000)
    business_idea: str = Field(min_length=1, max_length=1000)
    location: str = Field(min_length=1, max_length=500)
    budget: str | None = Field(default=None, max_length=300)
    interests: str | None = Field(default=None, max_length=1000)
    analysis: str = Field(min_length=1, max_length=50000)
    conversation_id: str | None = Field(default=None, max_length=100)
    history: list[AdvisorMessage] = Field(default_factory=list, max_length=20)
    language: str = Field(default="en", pattern="^(en|ur|ar)$")


class FinderRecommendation(BaseModel):
    business_name: str
    short_description: str
    why_it_fits: str
    estimated_startup_budget: str
    target_customer: str
    business_model: str
    first_validation_step: str
    risk_level: str
    planner_query: str


class FinderResponse(BaseModel):
    recommendations: list[FinderRecommendation]


@app.post("/analyze")
async def analyze(request: AnalyzeRequest) -> dict[str, str]:
    user_id = f"api-user-{uuid4()}"

    try:
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
        )
        message = types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        f"Business idea: {request.business_idea}\n"
                        f"Location: {request.location}\n"
                        f"Available budget (provided by the user, not researched): "
                        f"{request.budget or 'Not provided'}\n"
                        f"Interests / preferences (provided by the user): "
                        f"{request.interests or 'Not provided'}\n"
                        f"Response language: {request.language}. Write the complete response in this language.\n"
                        "Budget evaluation instruction: when a budget is provided, use it "
                        "as the user's available capital. Compare it with researched or "
                        "estimated startup costs, clearly label estimates, and state whether "
                        "the business appears affordable. Do not invent costs; if reliable "
                        "cost information is unavailable, say so. Consider interests when "
                        "relevant, and include the budget comparison in financial feasibility "
                        "and the final recommendation."
                    )
                )
            ],
        )

        final_text = None
        async for event in runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=message,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = event.content.parts[0].text

        if not final_text:
            raise RuntimeError("The agent returned no final response")

        return {"response": final_text}
    except Exception as exc:
        logger.exception("Business analysis failed")
        raise HTTPException(
            status_code=500,
            detail="Unable to complete the business analysis.",
        ) from exc


@app.post("/advisor")
async def advise(request: AdvisorRequest) -> dict[str, str]:
    conversation_id = request.conversation_id or f"advisor-{uuid4()}"

    try:
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=conversation_id,
            session_id=conversation_id,
        )
        if session is None:
            session = await session_service.create_session(
                app_name=APP_NAME,
                user_id=conversation_id,
                session_id=conversation_id,
            )

        history = "\n".join(
            f"{message.role.title()}: {message.content}" for message in request.history
        )
        prompt = (
            f"Current venture context:\n"
            f"Business idea: {request.business_idea}\n"
            f"Location: {request.location}\n"
            f"Available budget: {request.budget or 'Not provided'}\n"
            f"Interests / preferences: {request.interests or 'Not provided'}\n\n"
            f"Response language: {request.language}. Reply completely and naturally in this language.\n\n"
            f"Current VentureForge analysis:\n{request.analysis}\n\n"
            f"Conversation so far:\n{history or 'No earlier messages.'}\n\n"
            f"User question: {request.question}"
        )
        final_text = None
        async for event in advisor_runner.run_async(
            user_id=conversation_id,
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = event.content.parts[0].text

        if not final_text or not final_text.strip():
            raise RuntimeError("The advisor returned no final response")
        return {"response": final_text.strip(), "conversation_id": conversation_id}
    except Exception as exc:
        logger.exception("Advisor response failed")
        error_text = str(exc).lower()
        status_code = 503 if "503" in error_text or "unavailable" in error_text else 502
        raise HTTPException(
            status_code=status_code,
            detail="AI Advisor is temporarily unavailable. Please try again shortly.",
        ) from exc


@app.post("/roadmap")
async def roadmap(request: AdvisorRequest) -> dict[str, str]:
    conversation_id = request.conversation_id or f"roadmap-{uuid4()}"

    try:
        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=conversation_id,
            session_id=conversation_id,
        )
        if session is None:
            session = await session_service.create_session(
                app_name=APP_NAME,
                user_id=conversation_id,
                session_id=conversation_id,
            )

        prompt = (
            f"Current venture context:\n"
            f"Business idea: {request.business_idea}\n"
            f"Location: {request.location}\n"
            f"Available budget: {request.budget or 'Not provided'}\n"
            f"Interests / preferences: {request.interests or 'Not provided'}\n\n"
            f"Response language: {request.language}. Reply completely and naturally in this language.\n\n"
            f"Current VentureForge analysis:\n{request.analysis}\n\n"
            f"Please generate a comprehensive, practical Business Roadmap based on the analysis above."
        )
        final_text = None
        async for event in advisor_runner.run_async(
            user_id=conversation_id,
            session_id=session.id,
            new_message=types.Content(role="user", parts=[types.Part(text=prompt)]),
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = event.content.parts[0].text

        if not final_text or not final_text.strip():
            raise RuntimeError("The roadmap generator returned no final response")
        return {"response": final_text.strip(), "conversation_id": conversation_id}
    except Exception as exc:
        logger.exception("Roadmap generation failed")
        error_text = str(exc).lower()
        status_code = 503 if "503" in error_text or "unavailable" in error_text else 502
        raise HTTPException(
            status_code=status_code,
            detail="Roadmap generation is temporarily unavailable. Please try again shortly.",
        ) from exc


@app.post("/finder/recommend", response_model=FinderResponse)
async def recommend(request: FinderRequest) -> FinderResponse:
    user_id = f"finder-user-{uuid4()}"

    try:
        session = await session_service.create_session(
            app_name=APP_NAME,
            user_id=user_id,
        )
        message = types.Content(
            role="user",
            parts=[
                types.Part(
                    text=(
                        f"Available budget: {request.budget}\n"
                        f"Location: {request.location}\n"
                        f"Interests: {request.interests or 'Not provided'}\n"
                        f"Skills: {request.skills or 'Not provided'}\n"
                        f"Preferred business type: {request.business_type or 'Not provided'}"
                        f"\nResponse language: {request.language}. Return all recommendation values in this language, but keep the JSON field names unchanged."
                    )
                )
            ],
        )

        final_text = None
        async for event in finder_runner.run_async(
            user_id=user_id,
            session_id=session.id,
            new_message=message,
        ):
            if event.is_final_response() and event.content and event.content.parts:
                final_text = event.content.parts[0].text

        if not final_text:
            raise RuntimeError("The finder agent returned no final response")
        parsed = json.loads(final_text.strip())
        return FinderResponse.model_validate(parsed)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.exception("Business finder returned an invalid response")
        raise HTTPException(
            status_code=502,
            detail="The business finder returned an invalid recommendation response.",
        ) from exc
    except Exception as exc:
        logger.exception("Business finder failed")
        raise HTTPException(
            status_code=500,
            detail="Unable to generate business recommendations right now.",
        ) from exc