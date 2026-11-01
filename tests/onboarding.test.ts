import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBoard, encodeBoard } from '../src/lib/codec.ts';
import { lane } from '../src/lib/model.ts';
import { onboardingBoard } from '../src/lib/onboarding.ts';

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
