"""
JD scraper for Greenhouse, Lever, Ashby, Workday, and generic company pages.
Uses httpx + BeautifulSoup. Respects robots.txt by design — only fetches public job pages.
"""
import re
from urllib.parse import urlparse
import httpx
from bs4 import BeautifulSoup

from app.models.job import JobSource

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; JDAnalyze/1.0; job search tool)",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}

TIMEOUT = httpx.Timeout(15.0)


def detect_source(url: str) -> JobSource:
    domain = urlparse(url).netloc.lower()
    if "greenhouse.io" in domain or "boards.greenhouse" in domain:
        return JobSource.greenhouse
    if "jobs.lever.co" in domain or "lever.co" in domain:
        return JobSource.lever
    if "ashbyhq.com" in domain or "jobs.ashbyhq" in domain:
        return JobSource.ashby
    if "myworkdayjobs.com" in domain or "workday.com" in domain:
        return JobSource.workday
    return JobSource.other


def _extract_greenhouse(soup: BeautifulSoup) -> str:
    content = soup.find("div", {"id": "content"}) or soup.find("div", class_=re.compile(r"job-post|content"))
    return content.get_text(separator="\n", strip=True) if content else ""


def _extract_lever(soup: BeautifulSoup) -> str:
    content = soup.find("div", class_="content") or soup.find("div", {"data-qa": "job-content"})
    if not content:
        content = soup.find("main")
    return content.get_text(separator="\n", strip=True) if content else ""


def _extract_ashby(soup: BeautifulSoup) -> str:
    # Ashby renders client-side; try meta + visible text fallback
    desc = soup.find("div", class_=re.compile(r"[Dd]escription|[Pp]osting"))
    if desc:
        return desc.get_text(separator="\n", strip=True)
    # Fallback: body text
    body = soup.find("body")
    return body.get_text(separator="\n", strip=True)[:8000] if body else ""


def _extract_generic(soup: BeautifulSoup) -> str:
    # Remove nav, header, footer, script, style
    for tag in soup(["script", "style", "nav", "header", "footer", "aside"]):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.find("div", class_=re.compile(r"job|posting|description"))
    if main:
        return main.get_text(separator="\n", strip=True)
    return soup.get_text(separator="\n", strip=True)[:10000]


async def fetch_jd_from_url(url: str) -> tuple[str, JobSource]:
    """
    Fetch and extract job description text from a URL.
    Returns (text, source_type).
    """
    domain = urlparse(url).netloc.lower()
    if "linkedin.com" in domain:
        raise ValueError(
            "LinkedIn requires login and blocks scraping — it will only return a sign-in "
            "page, not the job description. Copy the job text and paste it directly instead."
        )
    if "indeed.com" in domain:
        raise ValueError(
            "Indeed blocks automated requests. Copy the job text and paste it directly instead."
        )

    source = detect_source(url)

    async with httpx.AsyncClient(headers=HEADERS, timeout=TIMEOUT, follow_redirects=True) as client:
        try:
            response = await client.get(url)
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ValueError(
                f"The site returned an error ({e.response.status_code}) and likely blocked this "
                "request. Copy the job text and paste it directly instead."
            ) from e
        except httpx.HTTPError as e:
            raise ValueError(f"Could not reach that URL: {e}") from e

    soup = BeautifulSoup(response.text, "lxml")

    if source == JobSource.greenhouse:
        text = _extract_greenhouse(soup)
    elif source == JobSource.lever:
        text = _extract_lever(soup)
    elif source == JobSource.ashby:
        text = _extract_ashby(soup)
    else:
        text = _extract_generic(soup)

    # Clean up excess whitespace
    text = re.sub(r"\n{3,}", "\n\n", text).strip()

    if len(text) < 100:
        raise ValueError(f"Extracted text too short ({len(text)} chars). Page may be client-rendered.")

    return text, source
