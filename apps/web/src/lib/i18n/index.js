/**
 * Interface translations. English text is the key: tr('Synced {0}', when) looks the text up in
 * the reader's language and fills {0}, {1}… from the arguments; anything not translated stays
 * in English. The root layout sets the language for each page from the planner-lang cookie
 * (or the browser's languages), and changing it reloads the page.
 *
 * The languages are those Paizo's Pathfinder Second Edition is published in. Game content synced
 * from Foundry (feat names, descriptions) stays in whatever language that world uses.
 */
export const LOCALES=[
  ['en','English'],['de','Deutsch'],['es','Español'],['fr','Français'],['it','Italiano'],
  ['ja','日本語'],['pl','Polski'],['pt-BR','Português (Brasil)']
];
export const COOKIE='planner-lang';
const CODES=LOCALES.map(([code])=>code);

let current='en';
let messages={};

export function setLocale(code,catalog){
  current=CODES.includes(code)?code:'en';
  messages=catalog??{};
}
export const locale=()=>current;

// A key may end in "|context" ("Light|theme") to tell it apart from the same English word
// elsewhere ("Light" armor); untranslated, the context is dropped.
export function tr(text,...args){
  const value=messages[text]??text.replace(/\|[a-z ]+$/,'');
  return args.length?value.replace(/\{(\d+)\}/g,(m,i)=>args[i]??''):value;
}

/** A supported language from a cookie value, else the best match in Accept-Language. */
export function pickLocale(cookie,accept=''){
  if(CODES.includes(cookie))return cookie;
  for(const part of String(accept).split(',')){
    const tag=part.split(';')[0].trim().toLowerCase();
    const exact=CODES.find(c=>c.toLowerCase()===tag);
    if(exact)return exact;
    const base=CODES.find(c=>c.split('-')[0]===tag.split('-')[0]);
    if(base)return base;
  }
  return 'en';
}

export function chooseLocale(code){
  document.cookie=`${COOKIE}=${encodeURIComponent(code)}; path=/; max-age=31536000; samesite=lax`;
  location.reload();
}

/**
 * A table of English labels that translates when read: module constants load before the
 * language is set, so they hold English and translate at display time.
 */
export function labels(table){
  return new Proxy(table,{get(target,key){const value=Reflect.get(target,key);return typeof value==='string'?tr(value):value;}});
}
