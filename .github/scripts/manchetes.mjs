// Lê os feeds das fontes da skill, filtra os últimos 3 dias, deduplica e ordena por relevância. Sem IA, sem custo.
import { writeFileSync } from 'node:fs';
const FEEDS = [
  ['Imobi Report','https://imobireport.com.br/feed/'],
  ['Portal VGV','https://www.portalvgv.com.br/feed/'],
  ['InfoMoney','https://www.infomoney.com.br/tudo-sobre/mercado-imobiliario/feed/'],
  ['Secovi-SP','https://www.secovi.com.br/feed/'],
  ['Exame','https://exame.com/feed/', true]   // feed geral: só entra o que casar com as palavras do setor
];
const SETOR=/imobili|im[óo]ve|loteament|incorporad|incorpora[çc][ãa]o|\bvgv\b|cr[ée]dito imobili|financiamento imobili|aluguel|\bfiis?\b|minha casa|habita[çc]/i;
const PESO=[/selic|juro|cr[ée]dito|financiamento|funding|cri\b/i,/reforma tribut|ibs|cbs|decreto|lei\b|regula/i,/lançament|vgv|vendas|estoque|pre[çc]o|vac[âa]ncia/i,/loteament|urbanis|bairro planejado|condom[íi]nio/i];
const tag=(x,t)=>{const m=x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));return m?m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/,'$1').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&#8217;|&rsquo;/g,'’').replace(/&quot;/g,'"').trim():'';};
const limite=Date.now()-3*864e5, itens=[];
for(const [fonte,url,filtrar] of FEEDS){
  try{
    const xml=await (await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (artesano-ia)'},signal:AbortSignal.timeout(20000)})).text();
    for(const it of xml.split('<item>').slice(1)){
      const titulo=tag(it,'title'), link=tag(it,'link')||(it.match(/<link>([^<]+)/)||[])[1]||'', pub=new Date(tag(it,'pubDate')), desc=tag(it,'description');
      if(!titulo||!link||isNaN(pub)||pub.getTime()<limite) continue;
      if(filtrar&&!SETOR.test(titulo+' '+desc)) continue;
      const peso=PESO.reduce((n,r,i)=>n+(r.test(titulo+' '+desc)?(4-i):0),0);
      itens.push({fonte,titulo,url:link.trim(),ts:pub.getTime(),data:pub.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'}),peso});
    }
  }catch(e){console.error('falhou',fonte,e.message);}
}
const vistos=new Set(), unicos=itens.filter(i=>{const k=i.titulo.toLowerCase().replace(/[^a-z0-9]+/g,' ').slice(0,60);if(vistos.has(k))return false;vistos.add(k);return true;});
unicos.sort((a,b)=>(b.peso-a.peso)||(b.ts-a.ts));
const atualizado=new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).replace(',','');
writeFileSync('manchetes.json',JSON.stringify({atualizado,itens:unicos.slice(0,12).map(({peso,ts,...r})=>r)},null,1));
console.log(unicos.length,'manchetes');
