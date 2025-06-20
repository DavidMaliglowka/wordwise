import nspell from 'nspell';

let spellPromise: Promise<ReturnType<typeof nspell>> | null = null;

export function getSpell() {
  if (!spellPromise) {
    spellPromise = (async () => {
      try {
        const [aff, dic] = await Promise.all([
          fetch('/dict/en_US.aff').then(r => {
            if (!r.ok) throw new Error(`Failed to load .aff: ${r.status}`);
            return r.text();
          }),
          fetch('/dict/en_US.dic').then(r => {
            if (!r.ok) throw new Error(`Failed to load .dic: ${r.status}`);
            return r.text();
          })
        ]);

        return nspell({ aff, dic });
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
