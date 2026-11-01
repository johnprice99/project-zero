import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBoard, encodeBoard } from '../src/lib/codec.ts';
import { emptyBoard, isEmptyBoard, lane, addColumn, renameColumn } from '../src/lib/model.ts';
import { onboardingBoard } from '../src/lib/onboarding.ts';
import { sampleBoard } from './sample.ts';

test('the onboarding board is a valid board with its tasks in order', () => {
  const board = onboardingBoard();
  assert.deepEqual(decodeBoard(JSON.parse(JSON.stringify(encodeBoard(board)))), board);
  assert.deepEqual(
    board.projects.map(p => p.name),
    ['Onboard to Project Zero'],
  );
  for (const column of board.columns) {
    const orders = lane(board, 'all', column.id).map(t => t.order);
    assert.deepEqual(
      orders,
      orders.map((_, i) => i),
      `${column.name} is ordered`,
    );
  }
  assert.equal(lane(board, 'all', 'doing')[0].blocked, true);
  assert.equal(lane(board, 'all', 'done').length, 1);
});

test('a board is empty with no projects and the default columns', () => {
  assert.equal(isEmptyBoard(emptyBoard()), true);
  assert.equal(isEmptyBoard(onboardingBoard()), false);
  assert.equal(isEmptyBoard(sampleBoard()), false);
  assert.equal(isEmptyBoard(addColumn(emptyBoard(), 'Review')), false);
  assert.equal(isEmptyBoard(renameColumn(emptyBoard(), 'doing', 'In progress')), false);
});
