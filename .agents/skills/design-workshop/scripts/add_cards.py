#!/usr/bin/env python3
"""Add agent proposals to an exported design board without modifying its source."""
import argparse
import json
from pathlib import Path
from uuid import uuid4

TYPES = {'actor', 'process', 'input', 'output', 'failure', 'decision', 'image', 'note', 'storage', 'suggestion', 'reference', 'schema', 'codebase'}
ADD_TYPES = {'suggestion', 'reference', 'schema', 'codebase'}


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def validate_board(board):
    if not isinstance(board, dict) or board.get('version') != 2 or not isinstance(board.get('cases'), list) or not board['cases']:
        raise ValueError('expected a version 2 board with cases')
    ids = set()
    for case in board['cases']:
        if not isinstance(case, dict) or not all(isinstance(case.get(k), str) for k in ('id', 'name', 'note')) or case['id'] in ids:
            raise ValueError('invalid or duplicate board ID')
        ids.add(case['id'])
        if not isinstance(case.get('cards'), list) or not isinstance(case.get('links'), list):
            raise ValueError('invalid cards or links')
        card_ids = set()
        for card in case['cards']:
            if not isinstance(card, dict) or not all(isinstance(card.get(k), str) for k in ('id', 'type', 'title', 'body')) or card['id'] in card_ids or card['type'] not in TYPES:
                raise ValueError('invalid or duplicate card ID')
            if any(not isinstance(card.get(k), (int, float)) or isinstance(card[k], bool) or not -100000 < card[k] < 100000 for k in ('x', 'y')):
                raise ValueError('invalid card coordinates')
            if card['type'] == 'image' and (not isinstance(card.get('src'), str) or not card['src'].startswith('data:image/')):
                raise ValueError('invalid image')
            card_ids.add(card['id'])
        if any(not isinstance(link, dict) or link.get('from') not in card_ids or link.get('to') not in card_ids for link in case['links']):
            raise ValueError('invalid connection')
    if board.get('current') not in ids:
        raise ValueError('current board does not exist')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', required=True, help='exported board JSON')
    parser.add_argument('--additions', required=True, help='JSON with board_id and cards')
    parser.add_argument('--output', required=True, help='new board JSON; must not already exist')
    args = parser.parse_args()
    try:
        board = read_json(args.input)
        additions = read_json(args.additions)
        validate_board(board)
        if not isinstance(additions, dict) or not isinstance(additions.get('board_id'), str) or not isinstance(additions.get('cards'), list) or not additions['cards']:
            raise ValueError('additions must contain board_id and nonempty cards')
        case = next((c for c in board['cases'] if c['id'] == additions['board_id']), None)
        if case is None:
            raise ValueError('board_id not found')
        cards = additions['cards']
        for card in cards:
            if not isinstance(card, dict) or card.get('type') not in ADD_TYPES or not all(isinstance(card.get(k), str) and card[k].strip() for k in ('title', 'body')):
                raise ValueError('each addition needs type, title and body')
        used = {c['id'] for c in case['cards']}
        occupied = {(round(c['x'] / 255), round(c['y'] / 220)) for c in case['cards']}
        for card in cards:
            card_id = uuid4().hex
            while card_id in used:
                card_id = uuid4().hex
            used.add(card_id)
            # Leave existing cards untouched and use the next free grid position.
            index = 0
            while (index % 8, index // 8) in occupied:
                index += 1
            col, row = index % 8, index // 8
            occupied.add((col, row))
            case['cards'].append({'id': card_id, 'type': card['type'], 'title': card['title'], 'body': card['body'], 'x': 80 + col * 255, 'y': 80 + row * 220})
        validate_board(board)
        with Path(args.output).open('x', encoding='utf-8') as output:
            json.dump(board, output, ensure_ascii=False, indent=2, allow_nan=False)
            output.write('\n')
    except (OSError, ValueError, TypeError, json.JSONDecodeError) as exc:
        parser.exit(1, f'Cannot add cards: {exc}\n')


if __name__ == '__main__':
    main()
