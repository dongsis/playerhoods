import argparse
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import pandas as pd
import requests
from bs4 import BeautifulSoup


USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36"
)

REQUEST_HEADERS = {"User-Agent": USER_AGENT}
SEARCH_URL = "https://html.duckduckgo.com/html/"


@dataclass
class ExtractedInfo:
    court_count: str
    court_environment: str
    booking_required: str
    fee_type: str
    confidence: str
    source: str
    notes: str


def is_unknown(value: object) -> bool:
    if value is None:
        return True
    text = str(value).strip().lower()
    return text in {"", "unknown", "nan", "none"}


def clean_text(value: object) -> str:
    if value is None:
        return ""
    text = str(value)
    text = text.replace("\u200b", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def fetch_text(url: str, timeout: int = 15) -> str:
    try:
        response = requests.get(url, headers=REQUEST_HEADERS, timeout=timeout)
        response.raise_for_status()
    except Exception:
        return ""

    soup = BeautifulSoup(response.text, "lxml")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    return clean_text(soup.get_text(" ", strip=True))


def ddg_search(query: str, max_results: int = 3) -> list[str]:
    try:
        response = requests.post(
            SEARCH_URL,
            data={"q": query},
            headers=REQUEST_HEADERS,
            timeout=20,
        )
        response.raise_for_status()
    except Exception:
        return []

    soup = BeautifulSoup(response.text, "lxml")
    urls: list[str] = []
    for link in soup.select("a.result__a"):
        href = link.get("href")
        if href and href.startswith("http"):
            urls.append(href)
        if len(urls) >= max_results:
            break
    return urls


def infer_court_count(text: str) -> Optional[str]:
    patterns = [
        r"(\d{1,2})\s+(?:pickleball|tennis|padel|badminton)?\s*courts?",
        r"(\d{1,2})\s+(?:indoor|outdoor)\s+(?:pickleball|tennis)?\s*courts?",
        r"court\s+count[:\s]+(\d{1,2})",
        r"(\d{1,2})\s+dedicated\s+pickleball\s+courts?",
    ]
    candidates: list[int] = []
    for pattern in patterns:
        for match in re.finditer(pattern, text, flags=re.IGNORECASE):
            try:
                value = int(match.group(1))
            except Exception:
                continue
            if 1 <= value <= 24:
                candidates.append(value)
    if candidates:
        return str(max(candidates))
    return None


def infer_environment(text: str, sport: str = "") -> Optional[str]:
    lowered = text.lower()
    parts: list[str] = []

    if "indoor" in lowered and "outdoor" in lowered:
        parts.append("indoor/outdoor")
    elif "indoor" in lowered:
        parts.append("indoor")
    elif "outdoor" in lowered:
        parts.append("outdoor")

    if "hard court" in lowered or "hardcourt" in lowered:
        parts.append("hard")
    elif "clay" in lowered:
        parts.append("clay")
    elif "grass court" in lowered or "grass courts" in lowered:
        parts.append("grass")

    if "pickleball" in lowered and "tennis" in lowered:
        parts.append("tennis + pickleball lines")
    elif "pickleball" in lowered and sport.lower() == "pickleball":
        parts.append("pickleball")
    elif "tennis" in lowered and sport.lower() == "tennis":
        parts.append("tennis")

    if not parts:
        return None
    return ", ".join(dict.fromkeys(parts))


def infer_booking(text: str) -> Optional[str]:
    lowered = text.lower()
    if any(phrase in lowered for phrase in ["drop-in only", "walk-on", "walk on"]):
        return "no"
    if any(
        phrase in lowered
        for phrase in [
            "book online",
            "book a court",
            "booking required",
            "reservation required",
            "reserve a court",
            "court booking",
        ]
    ):
        return "yes"
    if "booking" in lowered or "reservation" in lowered or "reserve" in lowered:
        return "yes"
    if "public park" in lowered and "drop-in" in lowered:
        return "no"
    return None


def infer_fee(text: str) -> Optional[str]:
    lowered = text.lower()
    if any(phrase in lowered for phrase in ["free to play", "free public courts", "no fee", "free court"]):
        return "free"
    if any(phrase in lowered for phrase in ["membership required", "members only", "member only"]):
        return "membership"
    if any(phrase in lowered for phrase in ["drop-in fee", "court fee", "hourly rate", "$", "fees"]):
        return "paid"
    if "public access" in lowered or "public park" in lowered:
        return "free"
    return None


def build_context(row: pd.Series) -> tuple[str, str]:
    fields = [
        row.get("venue_name", ""),
        row.get("sports_guess", ""),
        row.get("sport", ""),
        row.get("google_type", ""),
        row.get("google_subtypes", ""),
        row.get("court_info_notes", ""),
        row.get("source", ""),
        row.get("court_info_source", ""),
    ]
    local_text = clean_text(" ".join(clean_text(v) for v in fields if clean_text(v)))
    query = " ".join(
        filter(
            None,
            [
                clean_text(row.get("venue_name", "")),
                clean_text(row.get("city", "")),
                clean_text(row.get("province", "")),
                clean_text(row.get("sport", "")),
                "court fee booking indoor outdoor",
            ],
        )
    )
    return local_text, query


def extract_info(row: pd.Series, search_enabled: bool) -> ExtractedInfo:
    website = clean_text(row.get("website", ""))
    sport = clean_text(row.get("sport", ""))
    local_text, query = build_context(row)
    fetched_urls: list[str] = []
    web_texts: list[str] = []

    if website.startswith("http"):
        fetched_urls.append(website)
        text = fetch_text(website)
        if text:
            web_texts.append(text[:20000])

    combined_text = clean_text(" ".join([local_text] + web_texts))
    count = infer_court_count(combined_text)
    environment = infer_environment(combined_text, sport)
    booking = infer_booking(combined_text)
    fee = infer_fee(combined_text)
    initial_filled = sum(value is not None for value in [count, environment, booking, fee])

    if search_enabled and (not web_texts or initial_filled <= 1):
        for url in ddg_search(query, max_results=2):
            if url in fetched_urls:
                continue
            fetched_urls.append(url)
            text = fetch_text(url)
            if text:
                web_texts.append(text[:12000])
            time.sleep(1.0)

    combined_text = clean_text(" ".join([local_text] + web_texts))
    count = infer_court_count(combined_text)
    environment = infer_environment(combined_text, sport)
    booking = infer_booking(combined_text)
    fee = infer_fee(combined_text)

    filled = sum(value is not None for value in [count, environment, booking, fee])
    confidence = "high" if filled >= 3 else "medium" if filled >= 2 else "low"
    notes_parts = []
    if website:
        notes_parts.append("official website checked")
    if search_enabled and len(fetched_urls) > (1 if website else 0):
        notes_parts.append("duckduckgo fallback checked")
    if not notes_parts:
        notes_parts.append("existing row signals only")

    return ExtractedInfo(
        court_count=count or "unknown",
        court_environment=environment or "unknown",
        booking_required=booking or "unknown",
        fee_type=fee or "unknown",
        confidence=confidence,
        source="; ".join(fetched_urls[:3]) if fetched_urls else clean_text(row.get("court_info_source", "")),
        notes="; ".join(notes_parts),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--skip-search", action="store_true")
    parser.add_argument("--sleep", type=float, default=1.0)
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)
    df = pd.read_excel(input_path)

    targets = []
    for index, row in df.iterrows():
        if any(is_unknown(row.get(field)) for field in ["court_count", "court_environment", "booking_required", "fee_type"]):
            targets.append(index)
    if args.limit > 0:
        targets = targets[: args.limit]

    print(f"rows_to_process={len(targets)}")
    for position, index in enumerate(targets, start=1):
        row = df.loc[index]
        venue_name = clean_text(row.get("venue_name", f"row {index}"))
        print(f"[{position}/{len(targets)}] {venue_name}")
        info = extract_info(row, search_enabled=not args.skip_search)

        for field, value in {
            "court_count": info.court_count,
            "court_environment": info.court_environment,
            "booking_required": info.booking_required,
            "fee_type": info.fee_type,
        }.items():
            if is_unknown(df.at[index, field]) and value != "unknown":
                df.at[index, field] = value

        df.at[index, "court_info_confidence"] = info.confidence
        if info.source:
            df.at[index, "court_info_source"] = info.source
        base_notes = clean_text(df.at[index, "court_info_notes"])
        extra_note = f"web enrichment: {info.notes}"
        df.at[index, "court_info_notes"] = clean_text(f"{base_notes} {extra_note}")
        df.at[index, "last_checked_at"] = pd.Timestamp.now().date().isoformat()
        time.sleep(args.sleep)

    df.to_excel(output_path, index=False)
    print(f"saved={output_path}")


if __name__ == "__main__":
    main()
