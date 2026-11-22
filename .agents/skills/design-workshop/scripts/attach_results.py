#!/usr/bin/env python3
"""Attach execution evidence to scenarios in an exported board."""
import argparse
import json
from pathlib import Path
from add_cards import read_json, validate_board


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True)
    parser.add_argument('--results', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    try:
        board, report = read_json(args.input), read_json(args.results)
        validate_board(board)
        if not isinstance(report, dict) or not isinstance(report.get('board_id'), str) or not isinstance(report.get('results'), list) or not report['results']:
            raise ValueError('results must specify board_id and a nonempty results list')
        case = next((c for c in board['cases'] if c['id'] == report['board_id']), None)
        if case is None or not isinstance(case.get('scenarios'), list):
            raise ValueError('board or scenarios not found')
        seen = set()
        for entry in report['results']:
            if not isinstance(entry, dict) or not isinstance(entry.get('scenario_id'), str) or entry['scenario_id'] in seen:
                raise ValueError('invalid or repeated scenario_id')
            seen.add(entry['scenario_id'])
            scenario = next((c for c in case['scenarios'] if c.get('id') == entry['scenario_id']), None)
            result = entry.get('result')
            if scenario is None or not isinstance(result, dict) or result.get('status') not in ('passed', 'failed', 'blocked') or not all(isinstance(result.get(k), str) and result[k].strip() for k in ('summary', 'actual', 'method', 'evidence')):
                raise ValueError('invalid scenario or result')
            scenario['result'] = {k: result[k] for k in ('status', 'summary', 'actual', 'method', 'evidence')}
        with Path(args.output).open('x', encoding='utf-8') as output:
            json.dump(board, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write('\n')
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        parser.exit(1, f'Cannot attach results: {exc}\n')


if __name__ == '__main__':
    main()
