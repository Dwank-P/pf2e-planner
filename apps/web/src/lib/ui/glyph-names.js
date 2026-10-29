/** Which glyph (glyphs.js) stands for each save, skill and stat. */
export const SAVE_GLYPHS={perception:'eyeball',fortitude:'fist',reflex:'run',will:'brain',ac:'checked-shield'};
export const SKILL_GLYPHS={acrobatics:'acrobatic',arcana:'magic-swirl',athletics:'muscle-up',crafting:'anvil-impact',
  deception:'domino-mask',diplomacy:'shaking-hands',intimidation:'shouting',medicine:'health-normal',nature:'oak-leaf',
  occultism:'pentacle',performance:'lyre',religion:'holy-symbol',society:'family-tree',stealth:'hood',survival:'campfire',
  thievery:'lockpicks',computers:'processor',piloting:'steering-wheel'};
/** D&D 5e skill keys. */
export const SKILL_GLYPHS_5E={acr:'acrobatic',ani:'horse-head',arc:'magic-swirl',ath:'muscle-up',dec:'domino-mask',his:'scroll-unfurled',
  ins:'light-bulb',itm:'shouting',inv:'magnifying-glass',med:'health-normal',nat:'oak-leaf',prc:'eyeball',prf:'lyre',per:'shaking-hands',
  rel:'holy-symbol',slt:'snatch',ste:'hood',sur:'campfire'};
export const skillGlyph=skill=>SKILL_GLYPHS[skill]??(String(skill).endsWith(' lore')||String(skill).endsWith('-lore')?'book-cover':null);
