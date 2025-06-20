import nspell from 'nspell';

export interface HunspellDict {
  aff: string;
  dic: string;
}

let dictPromise: Promise<HunspellDict> | null = null;
let spellPromise: Promise<ReturnType<typeof nspell>> | null = null;

export function getHunspellDict() {
  if (!dictPromise) {
    dictPromise = Promise.all([
      fetch('/dict/en_US.aff').then(r => {
        if (!r.ok) throw new Error(`Failed to load .aff: ${r.status}`);
        return r.text();
      }),
      fetch('/dict/en_US.dic').then(r => {
        if (!r.ok) throw new Error(`Failed to load .dic: ${r.status}`);
        return r.text();
      })
    ]).then(([aff, dic]) => ({ aff, dic }));
  }
  return dictPromise;
}

export function getSpell() {
  if (!spellPromise) {
    spellPromise = (async () => {
      try {
        const dict = await getHunspellDict();
        return nspell(dict);
      } catch (error) {
        console.error('Failed to load spell checker dictionary:', error);
        // Return a mock spell checker that accepts everything
        return {
          correct: () => true,
          suggest: () => [],
          spell: () => true
        };
      }
    })();
  }
  return spellPromise;
}
