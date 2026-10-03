/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
// ═══════════════════════════════════════════════════════════════════
//  palabras-nsfw.js — Lista de términos que el bot no busca cuando el
//  NSFW está apagado en el grupo. Solo DATOS: la lógica de comparación
//  (que sí sabe distinguir "cum" de "cumpleaños") vive en filtro-texto.js.
//
//  Se sacó del comando .imagen para poder probarla: con 197 entradas
//  dentro de un archivo de 200 líneas, ningún test podía verificar que
//  la lista no se rompiera al editarla.
// ═══════════════════════════════════════════════════════════════════

export const PALABRAS_NSFW = [
  '+18', '18+', 'contenido adulto', 'contenido explícito', 'contenido sexual', 'actriz porno', 'actor porno', 'estrella porno',
  'pornstar', 'video xxx', 'xxx', 'x x x', 'pornhub', 'xvideos', 'xnxx', 'redtube',
  'brazzers', 'onlyfans', 'cam4', 'chaturbate', 'myfreecams', 'bongacams', 'livejasmin', 'spankbang',
  'tnaflix', 'hclips', 'fapello', 'mia khalifa', 'lana rhoades', 'riley reid', 'abella danger', 'brandi love',
  'eva elfie', 'nicole aniston', 'janice griffith', 'alexis texas', 'lela star', 'gianna michaels', 'adriana chechik', 'asa akira',
  'mandy muse', 'kendra lust', 'jordi el niño polla', 'johnny sins', 'danny d', 'manuel ferrara', 'mark rockwell', 'porno',
  'porn', 'sexo', 'sex', 'desnudo', 'desnuda', 'erótico', 'erotico', 'erotika',
  'tetas', 'pechos', 'boobs', 'boob', 'nalgas', 'culo', 'culos', 'qlos',
  'trasero', 'pene', 'verga', 'vergota', 'pito', 'chocha', 'vagina', 'vaginas',
  'coño', 'concha', 'genital', 'genitales', 'masturbar', 'masturbación', 'masturbacion', 'gemidos',
  'gemir', 'orgía', 'orgy', 'trío', 'trio', 'gangbang', 'creampie', 'facial',
  'cum', 'milf', 'teen', 'incesto', 'incest', 'violación', 'violacion', 'rape',
  'bdsm', 'hentai', 'tentacle', 'tentáculos', 'fetish', 'fetiche', 'sado', 'sadomaso',
  'camgirl', 'camsex', 'camshow', 'playboy', 'playgirl', 'playmate', 'striptease', 'striptis',
  'slut', 'puta', 'putas', 'perra', 'perras', 'whore', 'fuck', 'fucking',
  'fucked', 'cock', 'dick', 'pussy', 'ass', 'shemale', 'trans', 'transgénero',
  'transgenero', 'lesbian', 'lesbiana', 'gay', 'lgbt', 'explicit', 'hardcore', 'softcore',
  'nudista', 'nudismo', 'nudity', 'deepthroat', 'dp', 'double penetration', 'analplay', 'analplug',
  'rimjob', 'spank', 'spanking', 'lick', 'licking', '69', 'doggystyle', 'reverse cowgirl',
  'cowgirl', 'blowjob', 'bj', 'handjob', 'hj', 'p0rn', 's3x', 'v@gina',
  'c0ck', 'd1ck', 'fuk', 'fuking', 'fak', 'boobz', 'pusy', 'azz',
  'cumshot', 'sexcam', 'livecam', 'webcam', 'sexchat', 'sexshow', 'sexvideo', 'sexvid',
  'sexpics', 'sexphoto', 'seximage', 'sexgif', 'pornpic', 'pornimage', 'pornvid', 'pornvideo',
  'only fan', 'only-fans', 'only_fans', 'onlyfans.com', 'mia khalifha', 'mia khalifah', 'mia khalifaa', 'mia khalif4',
  'mia khal1fa', 'mia khalifa +18', 'mia khalifa xxx', 'mia khalifa desnuda', 'mia khalifa porno',
];

export default PALABRAS_NSFW;
