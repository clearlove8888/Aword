"""Build the CET-4 frequency vocabulary JSON from the supplied CSV tables."""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_SOURCE = Path(r"C:\懒笔记\tables")
OUTPUT = ROOT / "src" / "data" / "cet4-frequency-1616.json"

FILES = {
    "overview": (
        "单词总览.csv",
        ["词频排名", "单词", "语料总频次", "语料句频", "词形数", "义项行数", "搭配条数", "词频表释义"],
    ),
    "analysis": (
        "词义精析.csv",
        ["词频排名", "单词", "词性", "核心词义", "次数", "占比", "代表真题例句", "备注"],
    ),
    "meanings": (
        "词义与词性.csv",
        ["词频排名", "单词", "词性", "核心词义", "次数", "占比", "代表真题例句1", "代表真题例句2"],
    ),
    "forms": (
        "词形与语法变化.csv",
        ["词频排名", "单词", "词形", "词性", "语法变化", "次数", "代表真题例句"],
    ),
    "collocations": (
        "常见搭配.csv",
        ["词频排名", "单词", "搭配", "含义", "次数", "代表真题例句"],
    ),
}


def clean(value: str | None) -> str:
    return (value or "").strip()


def number(value: str | None) -> int:
    value = clean(value)
    return int(value) if value else 0


def read_table(source: Path, table: str) -> list[dict[str, str]]:
    filename, expected_headers = FILES[table]
    path = source / filename
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames != expected_headers:
            raise ValueError(
                f"{filename} headers changed: expected {expected_headers!r}, got {reader.fieldnames!r}"
            )
        return [{key: clean(value) for key, value in row.items()} for row in reader]


def row_key(row: dict[str, str]) -> tuple[int, str]:
    return number(row["词频排名"]), row["单词"].casefold()


def main() -> None:
    source = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    tables = {name: read_table(source, name) for name in FILES}
    overview = tables["overview"]

    keys = [row_key(row) for row in overview]
    words = [row["单词"].casefold() for row in overview]
    if len(overview) != 1616:
        raise ValueError(f"Expected 1616 overview rows, got {len(overview)}")
    if len(set(words)) != len(words):
        raise ValueError("单词总览.csv contains duplicate words")
    if [rank for rank, _ in keys] != list(range(1, len(overview) + 1)):
        raise ValueError("单词总览.csv ranks are not a continuous 1-based sequence")

    overview_keys = set(keys)
    grouped: dict[str, dict[tuple[int, str], list[dict[str, str]]]] = {}
    for name in ("analysis", "meanings", "forms", "collocations"):
        bucket: dict[tuple[int, str], list[dict[str, str]]] = defaultdict(list)
        for row in tables[name]:
            key = row_key(row)
            if key not in overview_keys:
                raise ValueError(f"Unmatched row in {FILES[name][0]}: rank={key[0]}, word={row['单词']!r}")
            bucket[key].append(row)
        grouped[name] = bucket

    old_words = json.loads((ROOT / "src" / "data" / "words.json").read_text(encoding="utf-8"))
    audio_ids = {item["word"].strip().casefold(): item["id"] for item in old_words}

    result = []
    for row in overview:
        key = row_key(row)
        result.append(
            {
                "id": key[0],
                "rank": key[0],
                "word": row["单词"],
                "meaning": row["词频表释义"],
                "audioId": audio_ids.get(key[1]),
                "corpusFrequency": number(row["语料总频次"]),
                "sentenceFrequency": number(row["语料句频"]),
                "meanings": [
                    {
                        "partOfSpeech": item["词性"],
                        "meaning": item["核心词义"],
                        "count": number(item["次数"]),
                        "percentage": item["占比"],
                        "examples": [
                            {"text": text, "translation": ""}
                            for text in (item["代表真题例句1"], item["代表真题例句2"])
                            if text
                        ],
                    }
                    for item in grouped["meanings"].get(key, [])
                ],
                "analysis": [
                    {
                        "partOfSpeech": item["词性"],
                        "meaning": item["核心词义"],
                        "count": number(item["次数"]),
                        "percentage": item["占比"],
                        "example": item["代表真题例句"],
                        "note": item["备注"],
                    }
                    for item in grouped["analysis"].get(key, [])
                ],
                "forms": [
                    {
                        "form": item["词形"],
                        "partOfSpeech": item["词性"],
                        "grammar": item["语法变化"],
                        "count": number(item["次数"]),
                        "example": item["代表真题例句"],
                    }
                    for item in grouped["forms"].get(key, [])
                ],
                "collocations": [
                    {
                        "phrase": item["搭配"],
                        "meaning": item["含义"],
                        "count": number(item["次数"]),
                        "example": item["代表真题例句"],
                    }
                    for item in grouped["collocations"].get(key, [])
                ],
            }
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    matched_audio = sum(item["audioId"] is not None for item in result)
    print(f"Imported {len(result)} rows; unique words: {len(set(words))}.")
    print(f"Existing recordings: {matched_audio}; speech fallback: {len(result) - matched_audio}.")


if __name__ == "__main__":
    main()
