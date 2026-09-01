// Crypto — precios de criptomonedas con CoinGecko
const PREDET = ['bitcoin','ethereum','solana'];
const ALIAS = {btc:'bitcoin',bitcoin:'bitcoin',eth:'ethereum',ethereum:'ethereum',sol:'solana',solana:'solana',doge:'dogecoin',dogecoin:'dogecoin',xrp:'ripple',ripple:'ripple',ada:'cardano',cardano:'cardano',ton:'the-open-network',usdt:'tether',tether:'tether'};
const BONITO = {bitcoin:'₿ Bitcoin',ethereum:'Ξ Ethereum',solana:'◎ Solana',dogecoin:'Ð Dogecoin',ripple:'✕ Ripple',cardano:'₳ Cardano','the-open-network':'💎 TON',tether:'₮ USDT'};
export default {
  name: "crypto", aliases: ["btc", "precio"], category: "utility",
  description: "Precio de criptomonedas 💹",
  usage: ".crypto [moneda]", cooldown: 10,
  async handler(sock, ctx) {
    const raw = (ctx.arg || '').trim().toLowerCase();
    let ids = raw ? raw.split(/[\s,]+/).map(p => ALIAS[p]||p) : PREDET;
    try {
      const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(',')}&vs_currencies=usd,mxn`, {
        headers: {'User-Agent':'Mozilla/5.0','Accept':'application/json'}
      });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const data = await res.json();
      if (!Object.keys(data).length) return '❌ Moneda(s) no encontrada(s).';
      let txt = '💹 *Criptomonedas*\n\n';
      for (const [id, p] of Object.entries(data)) {
        txt += `${BONITO[id]||id}\n💰 $${p.usd?.toLocaleString()||'?'} USD\n💲 $${p.mxn?.toLocaleString()||'?'} MXN\n\n`;
      }
      return txt.trim();
    } catch (e) { return `❌ Error: ${e.message}`; }
  }
};