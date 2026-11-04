/**
 * Voice rules for everything a learner reads: plain, short, second person, digits for
 * numbers, no em dashes, none of the banned words, no "not X, Y" reframes.
 * It reads the string literals in the lesson sources, so templates, hints, readouts and
 * feedback lines are all covered, not only the strings the tests happen to run.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const LITERAL = /'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g;
const BANNED = /\b(immersive|intuitive\w*|seamless\w*|dynamic\w*|unlock\w*|elevat\w*|showcas\w*|highlight\w*|robust\w*|leverag\w*|delv\w*|crucial\w*|vibrant\w*|innovativ\w*|effortless\w*)\b/i;
const NUMBER_WORDS = /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|sixteen|twenty|thirty)\b/i;
const REFRAMES = [
  /\bnot\s+(just|only|merely|about)\b/i,
  /\bnot\b[^.!?;]{1,60},\s+(but|it['’]s|it is|this is|that['’]s|rather|instead)\b/i,
  /\bisn['’]t\b[^.!?;]{1,60},\s+(it['’]s|it is|but)\b/i,
];
const SOURCES = [
  'unit1-deck.js', 'unit2-mixer.js', 'unit3-performance.js', 'unit4-mix.js', 'curriculum.js',
  'scoring.js', 'format.js', 'text.js', 'lesson-run.js', 'setup.js', 'runner.js',
  ...readdirSync(join(HERE, 'ui')).filter((name) => name.endsWith('.js')).map((name) => `ui/${name}`),
];

/** String literals that read as sentences or labels (contain a space and a letter). */
function sentencesIn(file) {
  const source = readFileSync(join(HERE, file), 'utf8');
  const found = [];
  for (const match of source.matchAll(LITERAL)) {
    const text = (match[1] ?? match[2] ?? match[3] ?? '').replace(/\$\{[^}]*\}/g, '0');
    if (/\s/.test(text.trim()) && /[a-z]/i.test(text) && !/^[\w./-]+$/.test(text) && !text.includes('{{')) found.push(text);
  }
  return found;
}

const allSentences = SOURCES.flatMap((file) => sentencesIn(file).map((text) => ({ file, text })));

test('the copy scan finds the lesson sentences it is meant to check', () => {
  assert.ok(allSentences.length > 120, `only ${allSentences.length} sentences found`);
  assert.ok(allSentences.some(({ text }) => text.startsWith('Press PLAY on deck 1')));
  assert.ok(allSentences.some(({ text }) => text.includes('Swap the bass on the phrase')));
});

test('no em dashes in sources or copy', () => {
  for (const file of SOURCES) {
    assert.ok(!readFileSync(join(HERE, file), 'utf8').includes('—'), `${file} has an em dash`);
  }
});

test('none of the banned words appear in learner-facing copy', () => {
  for (const { file, text } of allSentences) {
    const hit = BANNED.exec(text);
    assert.equal(hit, null, `${file}: "${hit && hit[0]}" in "${text}"`);
  }
});

test('numbers are digits, not words', () => {
  for (const { file, text } of allSentences) {
    const hit = NUMBER_WORDS.exec(text);
    assert.equal(hit, null, `${file}: "${hit && hit[0]}" in "${text}"`);
  }
});

test('no "not X, Y" reframes', () => {
  for (const { file, text } of allSentences) {
    REFRAMES.forEach((pattern) => assert.ok(!pattern.test(text), `${file}: reframe in "${text}"`));
  }
});

test('step sentences stay short enough to read at a glance', () => {
  const texts = allSentences.filter(({ file }) => file.startsWith('unit')).map(({ text }) => text);
  const steps = texts.filter((text) => /^(Press|Let|Set|Deck|Match|The|Both|Nudge|Raise|Slide|Each|Now|Bring|Turn|Swap|Finish|Jump)/.test(text));
  assert.ok(steps.length >= 25);
  steps.forEach((text) => assert.ok(text.length <= 240, `too long: ${text}`));
});
