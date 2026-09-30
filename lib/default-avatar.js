/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
const DEFAULT_AVATAR_URL = 'https://i.imgur.com/ZNpsU0j.jpg';

export function getDefaultAvatar() {
  return DEFAULT_AVATAR_URL;
}

// Función callable y a la vez compatible como string (toString/valueOf)
function defaultAvatar() {
  return DEFAULT_AVATAR_URL;
}
defaultAvatar.url = DEFAULT_AVATAR_URL;
defaultAvatar.toString = () => DEFAULT_AVATAR_URL;
defaultAvatar.valueOf = () => DEFAULT_AVATAR_URL;

export default defaultAvatar;
