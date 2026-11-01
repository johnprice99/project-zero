import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeBoard, encodeBoard, readableError, SCHEMA } from '../src/lib/codec.ts';
import { sampleBoard } from './sample.ts';

const roundtrip = (value: unknown) => JSON.parse(JSON.stringify(value));

test('saved boards roundtrip through JSON with their schema number', () => {
  const board = sampleBoard();
  board.columns.splice(2, 0, { id: 'review', name: 'Review' });
  board.collapsedProjects = ['web'];
  board.projects[0].color = '#bb22cc';
  const stored = roundtrip(encodeBoard(board));
  assert.equal(stored.schema, SCHEMA);
  assert.deepEqual(decodeBoard(stored), board);
});

test('decoding keeps only supported fields', () => {
  const stored = roundtrip(encodeBoard(sampleBoard()));
  stored.extra = true;
  stored.tasks[0].extra = true;
  assert.deepEqual(decodeBoard(stored), sampleBoard());
});

test('errors name the record and field that is wrong', () => {
  const stored = () => roundtrip(encodeBoard(sampleBoard()));
  const cases: [(doc: any) => void, RegExp][] = [
    [
      doc => {
        doc.tasks[3].title = '  ';
      },
      /tasks\[3\]\.title must be non-empty text of up to 300 characters/,
    ],
    [
      doc => {
        doc.tasks[2].projectId = 'missing';
      },
      /tasks\[2\]\.projectId must name one of the projects/,
    ],
    [
      doc => {
        doc.tasks[1].order = 'first';
      },
      /tasks\[1\]\.order must be a number/,
    ],
    [
      doc => {
        doc.tasks[3].status = 'done';
        doc.tasks[3].blocked = true;
      },
      /tasks\[3\]\.blocked cannot be set on completed work/,
    ],
    [
      doc => {
        doc.tasks.push({ ...doc.tasks[0] });
      },
      /tasks contains a duplicate id: “sample-0”/,
    ],
    [
      doc => {
        doc.projects[1].name = ' project ZERO ';
      },
      /projects contains a duplicate name/,
    ],
    [
      doc => {
        doc.projects[0].color = 'red; background: url(x)';
      },
      /projects\[0\]\.color/,
    ],
    [
      doc => {
        doc.columns = doc.columns.filter((c: { id: string }) => c.id !== 'doing');
      },
      /columns is missing the core “doing” column/,
    ],
    [
      doc => {
        doc.collapsedProjects = ['missing'];
      },
      /collapsedProjects\[0\] must name one of the projects/,
    ],
  ];
  for (const [damage, message] of cases) {
    const doc = stored();
    damage(doc);
    assert.throws(() => decodeBoard(doc), message);
  }
});

test('boards from a newer version of the app are refused rather than misread', () => {
  const doc = { ...roundtrip(encodeBoard(sampleBoard())), schema: SCHEMA + 1 };
  assert.throws(() => decodeBoard(doc), /newer version of Project Zero/);
  assert.throws(() => decodeBoard({ ...doc, schema: undefined }), /schema is missing/);
});

test('read errors are explained in plain language', () => {
  assert.match(readableError(new SyntaxError('Unexpected token'), 'x'), /not valid JSON/);
  assert.match(readableError({ kind: 'io', message: 'Disk full' }, 'x'), /Disk full/);
  assert.equal(readableError(undefined, 'Fallback'), 'Fallback');
});
