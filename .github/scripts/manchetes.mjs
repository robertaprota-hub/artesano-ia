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
// janela: desde o início do dia anterior (São Paulo). Segunda-feira: desde sexta.
const spNow=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
const diasAtras=spNow.getDay()===1?3:1;
const inicio=new Date(spNow); inicio.setDate(inicio.getDate()-diasAtras); inicio.setHours(0,0,0,0);
const limite=inicio.getTime()+3*36e5; // volta para UTC (SP é UTC-3 o ano todo)
const itens=[];
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
// resumo escrito pela skill (tarefa diária na nuvem) e salvo no Google Drive como noticias.json
let resumo=null;
try{
  const r=await fetch('https://drive.google.com/uc?export=download&id=1SpWiLkMzI03Fp_qvZWyWhQhjq86OgMBM',{signal:AbortSignal.timeout(20000)});
  const j=JSON.parse(await r.text());
  if(j&&Array.isArray(j.itens)&&j.itens.length) resumo=j;
}catch(e){console.error('resumo do Drive indisponível:',e.message);}
const jaNoResumo=new Set((resumo?.itens||[]).flatMap(it=>(it.fontes||[]).map(f=>(f.url||'').replace(/\/$/,''))));
const vistos=new Set(), unicos=itens.filter(i=>{
  if(jaNoResumo.has(i.url.replace(/\/$/,''))) return false;const k=i.titulo.toLowerCase().replace(/[^a-z0-9]+/g,' ').slice(0,60);if(vistos.has(k))return false;vistos.add(k);return true;});
unicos.sort((a,b)=>(b.peso-a.peso)||(b.ts-a.ts));
// no máximo 3 por fonte, para uma fonte não dominar a lista
const porFonte={}; const equilibrado=unicos.filter(i=>{porFonte[i.fonte]=(porFonte[i.fonte]||0)+1;return porFonte[i.fonte]<=3;});
const atualizado=new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).replace(',','');
writeFileSync('manchetes.json',JSON.stringify({atualizado,resumo,itens:equilibrado.slice(0,12).map(({peso,ts,...r})=>r)},null,1));
console.log(unicos.length,'manchetes');
