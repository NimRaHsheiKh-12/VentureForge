import os
from tavily import TavilyClient
from dotenv import load_dotenv

load_dotenv()

tavily_client = TavilyClient(
    api_key=os.getenv("TAVILY_API_KEY")
)


def web_search(query: str) -> dict:
    """
    Search the web using Tavily and return relevant results.
    """

    response = tavily_client.search(
        query=query,
        search_depth="advanced",
        max_results=5
    )

    return {
        "query": query,
        "results": response.get("results", [])
    }