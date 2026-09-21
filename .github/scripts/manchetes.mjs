// Lê os feeds das fontes da skill, filtra por data, deduplica, equilibra por fonte e monta o resumo do dia.
// Sem IA, sem custo. Roda todo dia às 7h (São Paulo) pela GitHub Action.
import { writeFileSync } from 'node:fs';
const FEEDS = [
  ['Imobi Report','https://imobireport.com.br/feed/'],
  ['Portal VGV','https://www.portalvgv.com.br/feed/'],
  ['InfoMoney','https://www.infomoney.com.br/tudo-sobre/mercado-imobiliario/feed/'],
  ['Secovi-SP','https://www.secovi.com.br/feed/'],
  ['CBIC','https://cbic.org.br/feed/', 'obra'],           // feed institucional: só o que for de mercado, crédito, regulação ou obra
  ['SindusCon-SP','https://sindusconsp.com.br/feed/', 'obra'],
  ['Exame','https://exame.com/feed/', true]   // feed geral: só entra o que casar com as palavras do setor
];
const OBRA=/imobili|incorporad|loteament|constru[çc][ãa]o|funding|fgts|cr[ée]dito|financiamento|habita|selic|minha casa|\bobras?\b|tribut|licen[çc]|regula|\blei\b|decreto|infraestrutura|saneamento|custo|\bcub\b|inadimpl/i;
const SETOR=/imobili|im[óo]ve|loteament|incorporad|incorpora[çc][ãa]o|\bvgv\b|cr[ée]dito imobili|financiamento imobili|aluguel|\bfiis?\b|minha casa|habita[çc]/i;
const PESO=[/selic|juro|cr[ée]dito|financiamento|funding|\bcri\b/i,/reforma tribut|\bibs\b|\bcbs\b|decreto|\blei\b|regula/i,/lançament|vgv|vendas|estoque|pre[çc]o|vac[âa]ncia/i,/loteament|urbanis|bairro planejado|condom[íi]nio/i];
const LIXO=/ingresso|desconto|inscri[çc][õo]es|patrocinad|webinar|podcast/i;
const limpa=t=>t.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&#8217;|&rsquo;|&#8216;/g,'’').replace(/&#8220;|&#8221;|&quot;/g,'"').replace(/&#8211;|&ndash;/g,'–').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
const tag=(x,t)=>{const m=x.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`));return m?limpa(m[1]):'';};
const spNow=new Date(new Date().toLocaleString('en-US',{timeZone:'America/Sao_Paulo'}));
const dataSP=ts=>new Date(ts).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'});
const inicioDias=n=>{const d=new Date(spNow);d.setDate(d.getDate()-n);d.setHours(0,0,0,0);return d.getTime()+3*36e5;}; // SP é UTC-3 o ano todo

const brutos=[];
for(const [fonte,url,filtrar] of FEEDS){
  try{
    const xml=await (await fetch(url,{headers:{'User-Agent':'Mozilla/5.0 (artesano-ia)'},signal:AbortSignal.timeout(20000)})).text();
    for(const it of xml.split('<item>').slice(1)){
      const titulo=tag(it,'title'), link=(tag(it,'link')||(it.match(/<link>([^<]+)/)||[])[1]||'').trim(), pub=new Date(tag(it,'pubDate')), desc=tag(it,'description');
      if(!titulo||!link||isNaN(pub)) continue;
      const texto=titulo+' '+desc;
      if(filtrar===true&&!SETOR.test(texto)) continue;
      if(filtrar==='obra'&&!OBRA.test(texto)) continue;
      if(LIXO.test(titulo)) continue;
      const peso=PESO.reduce((n,r,i)=>n+(r.test(texto)?(4-i):0),0);
      // primeira frase da descrição, sem o boilerplate de "o post apareceu primeiro"
      let ctx=desc.replace(/O post .*? apareceu primeiro em .*$/i,'').replace(/Não perca .*?\.\s*/i,'').replace(/Os ingressos .*?\.\s*/i,'').trim();
      const fr=ctx.match(/^.{40,300}?[.!?](\s|$)/); ctx=fr?fr[0].trim():(ctx.length>200?ctx.slice(0,200).replace(/\s+\S*$/,'')+'…':ctx);
      brutos.push({fonte,titulo,url:link,ts:pub.getTime(),data:dataSP(pub),peso,ctx});
    }
  }catch(e){console.error('falhou',fonte,e.message);}
}
// janela fixa: segunda-feira pega sexta, sábado e domingo; nos outros dias, só o dia anterior (mais o que saiu hoje até a hora da leitura)
const janela=spNow.getDay()===1?3:1;
// fecha a janela à meia-noite de hoje: o que sair hoje entra amanhã, e nada aparece dois dias seguidos
const itens=brutos.filter(i=>i.ts>=inicioDias(janela)&&i.ts<inicioDias(0));
const vistos=new Set(), unicos=itens.filter(i=>{const k=i.titulo.toLowerCase().replace(/[^a-z0-9]+/g,' ').slice(0,60);if(vistos.has(k))return false;vistos.add(k);return true;});
unicos.sort((a,b)=>(b.peso-a.peso)||(b.ts-a.ts));
const porFonte={}; const equilibrado=unicos.filter(i=>{porFonte[i.fonte]=(porFonte[i.fonte]||0)+1;return porFonte[i.fonte]<=3;});

// resumo do dia: os 4 mais relevantes, com uma frase de contexto da própria fonte
const hoje=spNow.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
const hora=spNow.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}).replace(':','h');
let resumo={data:hoje,hora,periodo:janela>1?'sexta a domingo':'ontem',itens:equilibrado.slice(0,4).map(i=>({titulo:i.titulo,texto:i.ctx,fontes:[{nome:i.fonte,url:i.url}]}))};
// se a skill tiver gravado um resumo recente no Drive, ele tem prioridade
try{
  const r=await fetch('https://drive.google.com/uc?export=download&id=1SpWiLkMzI03Fp_qvZWyWhQhjq86OgMBM',{signal:AbortSignal.timeout(20000)});
  const j=JSON.parse(await r.text()); const [dd,mm,aa]=String(j?.data||'').split('/').map(Number);
  const idade=(spNow-new Date(aa,mm-1,dd))/864e5;
  if(j&&Array.isArray(j.itens)&&j.itens.length&&idade<2) resumo={...j,periodo:'resumo da skill'};
}catch(e){console.error('resumo do Drive indisponível:',e.message);}
const noResumo=new Set(resumo.itens.flatMap(it=>(it.fontes||[]).map(f=>(f.url||'').replace(/\/$/,''))));
const lista=equilibrado.filter(i=>!noResumo.has(i.url.replace(/\/$/,''))).slice(0,10).map(({peso,ts,ctx,...r})=>r);
writeFileSync('manchetes.json',JSON.stringify({atualizado:dataSP(spNow)+' '+hora,janela,resumo,itens:lista},null,1));
console.log(brutos.length,'lidas |',equilibrado.length,'na janela de',janela,'dia(s) |',resumo.itens.length,'no resumo |',lista.length,'manchetes');
