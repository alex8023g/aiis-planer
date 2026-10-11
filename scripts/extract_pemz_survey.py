"""Выгружает опрос ПЭМЗ из .xlsx в prisma/data/pemz-survey.json для seed-pemz.ts.

Только стандартная библиотека: .xlsx — это zip с XML, а ради одного листа
тащить openpyxl незачем. Значения ячеек выгружаются как есть, строками;
разбирает их seed. Объединённые ячейки остаются списком диапазонов: по ним
seed понимает, какие ТИ делят одно техническое решение.

Запуск из корня репозитория:
    python3 scripts/extract_pemz_survey.py
"""

import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "docs" / "excel_examples" / "АИИС ПЭМЗ.xlsx"
TARGET = ROOT / "prisma" / "data" / "pemz-survey.json"

NS = {
    "m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}
TEXT = "{%s}t" % NS["m"]


def column_index(ref: str) -> int:
    """«M12» -> 12 (0-based: A = 0)."""
    letters = re.match(r"[A-Z]+", ref).group(0)
    index = 0
    for letter in letters:
        index = index * 26 + ord(letter) - ord("A") + 1
    return index - 1


def row_number(ref: str) -> int:
    return int(re.search(r"\d+", ref).group(0))


def main() -> None:
    book = zipfile.ZipFile(SOURCE)

    shared = []
    if "xl/sharedStrings.xml" in book.namelist():
        for item in ET.fromstring(book.read("xl/sharedStrings.xml")).findall("m:si", NS):
            shared.append("".join(node.text or "" for node in item.iter(TEXT)))

    workbook = ET.fromstring(book.read("xl/workbook.xml"))
    rels = ET.fromstring(book.read("xl/_rels/workbook.xml.rels"))
    targets = {rel.get("Id"): rel.get("Target") for rel in rels}
    first = workbook.find("m:sheets", NS)[0]
    path = targets[first.get("{%s}id" % NS["r"])].lstrip("/")
    sheet = ET.fromstring(book.read(path if path.startswith("xl/") else "xl/" + path))

    cells: dict[int, dict[int, str]] = {}
    for row in sheet.find("m:sheetData", NS).findall("m:row", NS):
        for cell in row.findall("m:c", NS):
            value_node = cell.find("m:v", NS)
            inline = cell.find("m:is", NS)
            if cell.get("t") == "s" and value_node is not None:
                value = shared[int(value_node.text)]
            elif inline is not None:
                value = "".join(node.text or "" for node in inline.iter(TEXT))
            elif value_node is not None:
                value = value_node.text
            else:
                continue
            value = value.strip()
            if value:
                ref = cell.get("r")
                cells.setdefault(row_number(ref), {})[column_index(ref)] = value

    header_row = min(cells)
    width = max(cells[header_row]) + 1
    header = [cells[header_row].get(col) for col in range(width)]

    merges = []
    merge_node = sheet.find("m:mergeCells", NS)
    if merge_node is not None:
        merges = [merge.get("ref") for merge in merge_node]

    rows = [
        {"row": number, "cells": [cells[number].get(col) for col in range(width)]}
        for number in sorted(cells)
        if number != header_row
    ]

    TARGET.write_text(
        json.dumps(
            {
                "source": SOURCE.relative_to(ROOT).as_posix(),
                "sheet": first.get("name"),
                "header": header,
                "merges": merges,
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"{len(rows)} rows -> {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
