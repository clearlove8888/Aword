"""Refresh the web vocabulary from the source workbook (requires openpyxl)."""
import json
from pathlib import Path
import openpyxl

root = Path(__file__).resolve().parents[1]
source = root / '四级核心词汇_含例句.xlsx'
workbook = openpyxl.load_workbook(source, read_only=True, data_only=True)
sheet = workbook.worksheets[0]
rows = list(sheet.values)
if rows[0][0] != 'Word':
    raise ValueError('Expected Word in the first column')
words = []
for row_number, row in enumerate(rows[1:], 2):
    if not any(row):
        continue
    word, meaning, *examples = [str(value).strip() if value is not None else '' for value in row]
    if not word or not meaning:
        raise ValueError(f'Missing word or meaning at row {row_number}')
    example_lines = examples[0].splitlines() if examples and examples[0] else []
    example_lines_2 = examples[1].splitlines() if len(examples) > 1 and examples[1] else []
    words.append({
        'id': row_number,
        'word': word,
        'meaning': meaning,
        'example': example_lines[0] if example_lines else '',
        'translation': chr(10).join(example_lines[1:]),
        'example2': example_lines_2[0] if example_lines_2 else '',
        'translation2': chr(10).join(example_lines_2[1:]),
    })
if not words:
    raise ValueError('Workbook contains no vocabulary')
output = root / 'src' / 'data' / 'words.json'
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(words, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
workbook.close()
print(f'Imported {len(words)} rows. Unique words: {len({w["word"] for w in words})}.')
print(f'Longest meaning: {max(len(w["meaning"]) for w in words)} characters.')

