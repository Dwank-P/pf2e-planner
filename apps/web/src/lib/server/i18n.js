// The translation catalogs: src/lib/i18n/locales/<code>.json, keyed by the English text.
const files=import.meta.glob('../i18n/locales/*.json',{eager:true,import:'default'});
const catalogs=Object.fromEntries(Object.entries(files).map(([path,data])=>[path.match(/([\w-]+)\.json$/)[1],data]));

export function catalogFor(code){
  return code&&code!=='en'?catalogs[code]??{}:{};
}
