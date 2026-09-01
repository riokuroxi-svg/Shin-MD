// Morse — codifica/decodifica código morse
const MORSE = {
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',
  I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',
  Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',
  Y:'-.--',Z:'--..',0:'-----',1:'.----',2:'..---',3:'...--',4:'....-',
  5:'.....',6:'-....',7:'--...',8:'---..',9:'----.',
  '.':'.-.-.-',',':'--..--','?':'..--..','!':'-.-.--','/':'-..-.',
  '(':'-.--.',')':'-.--.-','&':'.-...',':':'---...',';':'-.-.-.',
  '=':'-...-','+':'.-.-.','-':'-....-','_':'..--.-','"':'.-..-.',
  '@':'.--.-.',' ':'/'
};
const REV = {}; for (const [k,v] of Object.entries(MORSE)) REV[v] = k;
export default {
  name: "morse", aliases: ["demorse"], category: "utility",
  description: "Convertir texto a código morse 📡",
  usage: ".morse <texto> o .demorse <codigo>", cooldown: 3,
  async handler(sock, ctx) {
    if (!ctx.arg) return "📡 *Morse*\n\n.morse hola mundo\n.demorse .... --- .-.. .-";
    const isDemorse = ctx.text.startsWith('.demorse');
    if (isDemorse) {
      const out = ctx.arg.trim().split(/\s+/).map(s => REV[s] || (s==='/'?' ':'?')).join('').toLowerCase();
      return `📡 *DEMORSE*\n\n> ${out}`;
    }
    const out = ctx.arg.toUpperCase().split('').map(c => c===' '?'/':MORSE[c]||c).join(' ');
    return `📡 *MORSE*\n\n\`${out}\`\n\n_Para decodificar: .demorse ${out.slice(0,50)}..._`;
  }
};