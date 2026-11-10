/**
 * Shin-MD - https://github.com/riokuroxi-svg/Shin-MD
 * Copyright (C) 2026 riokuroxi-svg
 * SPDX-License-Identifier: AGPL-3.0-only
 * Parte de Shin-MD. Mantener este header es obligatorio por AGPL.
 */
import fetch from 'node-fetch';
import defaultAvatar from "#lib/default-avatar";
import { state } from '#lib/theme';

const regex = /^(?:https:\/\/|git@)github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i;
const GH_HEADERS = { 'User-Agent': 'Shin-MD/3.7', Accept: 'application/vnd.github+json' };

export default {
  command: ['gitclone', 'git'],
  category: 'utils',
  description: 'Buscar y descargar un repositorio de GitHub.',
  run: async ({ msg, sock, text }) => {
    if (!text) {
      return sock.reply(msg.chat, '《✧》 Por favor, proporciona un enlace o nombre del repositorio de GitHub.', msg);
    }
    try {
      await msg.react('🕒');
      let info = '';
      let image;
      let zipBuffer, zipName;
      let repos = [];
      const match = text.match(regex);
      if (match) {
        const [, user, repo] = match;
        const repoRes = await fetch(`https://api.github.com/repos/${user}/${repo}`, { headers: GH_HEADERS, signal: AbortSignal.timeout(15000) });
        if (!repoRes.ok) throw new Error(`Repositorio no encontrado (HTTP ${repoRes.status})`);
        const repoData = await repoRes.json();
        const zipRes = await fetch(`https://api.github.com/repos/${user}/${repo}/zipball`, { headers: GH_HEADERS, signal: AbortSignal.timeout(30000) });
        if (!zipRes.ok) throw new Error(`No pude descargar el zipball (HTTP ${zipRes.status})`);
        zipName = zipRes.headers.get('content-disposition')?.match(/filename=(.*)/)?.[1]?.replace(/"/g, '');
        if (!zipName) zipName = `${repo}-${user}.zip`;
        zipBuffer = Buffer.from(await zipRes.arrayBuffer());
        repos.push(repoData);
        image = defaultAvatar();
      } else {
        const res = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(text)}`, { headers: GH_HEADERS, signal: AbortSignal.timeout(15000) });
        if (!res.ok) throw new Error(`GitHub API HTTP ${res.status}`);
        const json = await res.json();
        if (!json.items?.length) {
          await msg.react('✖️');
          return sock.reply(msg.chat, '《✧》 No se encontraron resultados.', msg);
        }
        if (json.items.length === 1) {
          const repo = json.items[0];
          const zipRes = await fetch(`https://api.github.com/repos/${repo.owner.login}/${repo.name}/zipball`, { headers: GH_HEADERS, signal: AbortSignal.timeout(30000) });
          if (zipRes.ok) {
            zipName = zipRes.headers.get('content-disposition')?.match(/filename=(.*)/)?.[1]?.replace(/"/g, '') || `${repo.name}-${repo.owner.login}.zip`;
            zipBuffer = Buffer.from(await zipRes.arrayBuffer());
          }
          repos.push(repo);
        } else {
          repos = json.items.slice(0, 5);
        }
        try {
          const avRes = await fetch(repos[0].owner.avatar_url, { signal: AbortSignal.timeout(10000) });
          image = avRes.ok ? Buffer.from(await avRes.arrayBuffer()) : defaultAvatar();
        } catch {
          image = defaultAvatar();
        }
      }
      info += repos.map((repo, index) => `✩ Resultado: ${index + 1}
✩ Creador: ${repo.owner?.login || '—'}
✩ Nombre: ${repo.name}
✩ Creado: ${formatDate(repo.created_at)}
✩ Actualizado: ${formatDate(repo.updated_at)}
✩ Visitas: ${repo.watchers ?? 0}
✩ Bifurcado: ${repo.forks ?? 0}
✩ Estrellas: ${repo.stargazers_count ?? 0}
✩ Issues: ${repo.open_issues ?? 0}
✩ Descripción: ${repo.description ? repo.description : 'Sin Descripción'}
✩ Enlace: ${repo.clone_url || repo.html_url}`).join('\n────────────────────\n');
      await sock.sendFile(msg.chat, image, 'github_info.jpg', info.trim(), msg);
      if (zipBuffer && zipName) {
        await sock.sendFile(msg.chat, zipBuffer, zipName, null, msg);
      }
      await msg.react('✔️');
    } catch (e) {
      await msg.react('✖️');
      return msg.reply(state('error', { detail: e.message }));
    }
  }
};

function formatDate(n, locale = 'es') {
  if (!n) return '—';
  const d = new Date(n);
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
}
