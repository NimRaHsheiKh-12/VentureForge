from .web_search import web_search


def research_business(business_idea: str, location: str) -> dict:
    """
    Research a business idea from multiple angles using web search.
    """

    searches = {
        "market": f"{business_idea} market demand trends in {location}",

        "competitors": (
            f"{business_idea} competitors businesses in {location} "
            f"pricing strengths weaknesses"
        ),

        "costs": (
            f"{business_idea} startup cost equipment investment "
            f"pricing in {location}"
        ),

        "customers": (
            f"{business_idea} target customers consumer behavior "
            f"preferences trends in {location}"
        ),

        "market_gaps": (
            f"{business_idea} underserved customers market gaps "
            f"customer complaints opportunities in {location}"
        ),

        "risks": (
            f"{business_idea} business challenges risks regulations "
            f"failures in {location}"
        ),
    }

    research = {}

    for category, query in searches.items():
        result = web_search(query)
        research[category] = result["results"]

    return {
        "business_idea": business_idea,
        "location": location,
        "research": research,
    }