declare module 'nspell' {
  interface NSpell {
    correct(word: string): boolean;
    suggest(word: string): string[];
    spell(word: string): boolean;
  }

  function nspell(dictionary: any): NSpell;
  export = nspell;
}
