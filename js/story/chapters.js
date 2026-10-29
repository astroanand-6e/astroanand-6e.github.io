/** Chapter table shared by the scroll observer, keyboard nav and the stage. */
export const CHAPTERS = Object.freeze([
  { id: 'hero', index: 0, num: '', label: 'Hero' },
  { id: 'heart', index: 1, num: '01', label: 'Heart' },
  { id: 'vision', index: 2, num: '02', label: 'Vision' },
  { id: 'care', index: 3, num: '03', label: 'Care' },
  { id: 'decks', index: 4, num: '04', label: 'Decks' },
  { id: 'calm', index: 5, num: '05', label: 'CALM' },
  { id: 'voice', index: 6, num: '06', label: 'Voice' },
  { id: 'now', index: 7, num: '07', label: 'Now' },
  { id: 'index', index: 8, num: '', label: 'Index' },
]);

export const MOBILE_QUERY = '(max-width: 767.98px)';

export function chapterIndex(id) {
  const found = CHAPTERS.find((chapter) => chapter.id === id);
  return found ? found.index : -1;
}
