import {catalogFor} from '#lib/server/i18n.js';

// Every page gets the reader's language and its translations (hooks.server.js picks it).
export function load({locals}){
  return {locale:locals.locale??'en',messages:catalogFor(locals.locale)};
}
