const CONFIG = { latitude: 47.912, longitude: 11.313, timezone: "Europe/Berlin", forecastDays: 14 };
const $ = id => document.getElementById(id);
const clamp = (n,min,max)=>Math.max(min,Math.min(max,n));
const kmhToKn = kmh => Math.round((kmh || 0) * 0.539957);
const fmtDate = iso => new Intl.DateTimeFormat("de-DE", { weekday:"short", day:"2-digit", month:"2-digit" }).format(new Date(iso));
const fmtLongDate = iso => new Intl.DateTimeFormat("de-DE", { weekday:"long", day:"2-digit", month:"long" }).format(new Date(iso));
const fmtHour = iso => new Intl.DateTimeFormat("de-DE", { hour:"2-digit", minute:"2-digit" }).format(new Date(iso));
const esc = s => String(s).replace(/[&<>'"]/g, m => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[m]));
const appState = { days: [], hourlyByDate: {}, water: [], map: null, windLayer: null };
const weatherMap = {0:"sonnig",1:"überwiegend sonnig",2:"leicht bewölkt",3:"bewölkt",45:"Nebel",48:"Reifnebel",51:"Niesel",53:"Niesel",55:"Niesel",61:"Regen",63:"Regen",65:"starker Regen",71:"Schnee",73:"Schnee",75:"starker Schnee",80:"Schauer",81:"Schauer",82:"starke Schauer",95:"Gewitter",96:"Gewitter",99:"Gewitter"};
const iconMap = c => c===0?"☀️":c<3?"🌤️":c===3?"☁️":c>=95?"⛈️":c>=80?"🌧️":c>=61?"🌧️":c>=51?"🌦️":"🌫️";
function windDirection(deg){const dirs=["N","NO","O","SO","S","SW","W","NW"];return dirs[Math.round((((deg||0)%360)/45))%8]}
function windDirectionLong(deg){const map={N:"Nord",NO:"Nordost",O:"Ost",SO:"Südost",S:"Süd",SW:"Südwest",W:"West",NW:"Nordwest"};return `${map[windDirection(deg)]} (${windDirection(deg)})`}
function windToBearing(deg){return ((deg || 0) + 180) % 360}
function isSunny(code){return code<=2} // 0=sonnig,1=überwiegend sonnig,2=leicht bewölkt
function isRainy(code){return code>=51} // Niesel, Regen, Schauer, Gewitter
function getPMHours(date){
  // Get 12-18 Uhr hourly data for a given date
  const all=appState.hourlyByDate[date]||[];
  return all.filter(h=>{const hr=new Date(h.time).getHours();return hr>=12&&hr<=18});
}
function avgHours(hrs,key){return hrs.length?hrs.reduce((s,h)=>s+(h[key]||0),0)/hrs.length:null}
function classifyDay(day){
  // Base values from daily data
  const tempMax=Math.round(day.temperature_2m_max);
  const dailyCode=day.weather_code;
  const storm=[95,96,99].includes(dailyCode);
  // Use 12-18 Uhr hourly data if available, else fall back to daily max
  const pmHrs=getPMHours(day.time);
  const hasPM=pmHrs.length>=2;
  const wind=hasPM?Math.round(avgHours(pmHrs,'wind')):kmhToKn(day.wind_speed_10m_max);
  const gust=hasPM?Math.round(avgHours(pmHrs,'gust')):kmhToKn(day.wind_gusts_10m_max);
  const temp=hasPM?Math.round(avgHours(pmHrs,'temp')):tempMax;
  const rain=hasPM?Math.round(avgHours(pmHrs,'rain')):day.precipitation_probability_max||0;
  // Weather code: prefer 14:00 hour code (most representative afternoon)
  const h14=pmHrs.find(h=>new Date(h.time).getHours()===14)||pmHrs[Math.floor(pmHrs.length/2)];
  const code=h14?h14.weather_code:dailyCode;
  const sunny=isSunny(code), rainy=isRainy(code), warm=temp>=22, mild=temp>=18;
  // ---- Scores ----
  let sailing=5,bathing=5,buoy=7;
  if(wind<3)sailing=2;else if(wind<=7)sailing=7;else if(wind<=16)sailing=9;else if(wind<=22)sailing=6;else sailing=3;
  if(gust>25)sailing-=2; if(gust>30)sailing-=2; if(storm||gust>=35)sailing=Math.min(sailing,2);
  sailing=clamp(sailing,0,10);
  // Baden: Wassertemp (from appState) + Lufttemp + Sonne
  const waterNow=appState.water&&appState.water[0]?appState.water[0].temp:18;
  bathing=clamp(Math.round((waterNow-15)*0.8+(temp-18)*0.5)+(sunny?2:0)+(rain<25?1:0)-(rain>60?3:0)-(storm?4:0),0,10);
  // Boje: Gesamtstimmung – lohnt sich der Ausflug?
  buoy=clamp(7+(warm?2:0)+(sunny?1:0)-(rain>40?3:0)-(rain>65?2:0)-(gust>22?2:0)-(storm?5:0),0,10);
  // ---- Ampelfarbe ----
  let title,tone;
  if(storm||gust>=35){title="Heute lieber an Land";tone="red"}
  else if(wind>=23&&gust>=30){title="Zu viel Wind";tone="red"}
  else if(wind>=18&&rainy){title="Rau und nass";tone="red"}
  else if(wind>=18){title="Sehr sportliches Segeln";tone="yellow"}
  else if(wind>=13&&rainy){title="Sportlich, aber nass";tone="yellow"}
  else if(wind>=13){title="Sportlicher Segeltag";tone="green"}
  else if(wind>=5&&sunny&&warm){title="Perfekter Segeltag";tone="green"}
  else if(wind>=5&&sunny&&mild){title="Schöner Segeltag";tone="green"}
  else if(wind>=5&&!rainy&&mild){title="Guter Segeltag";tone="green"}
  else if(wind>=5&&rainy){title="Segeln im Regen";tone="yellow"}
  else if(wind>=5){title="Mäßiger Segeltag";tone="yellow"}
  else if(warm&&sunny){title="Baden & Boje";tone="green"}
  else if(warm&&!rainy){title="Sommertag an der Boje";tone="green"}
  else if(warm){title="Sommertag, kaum Wind";tone="yellow"}
  else if(mild&&!rainy){title="Flautentag";tone="yellow"}
  else{title="Flaute";tone="yellow"}
  return{title,tone,sailing,bathing,buoy,wind,gust,temp,rain,code,text:makeText({wind,gust,temp,storm,rain,sunny,rainy,warm,mild})}
}
function makeText({wind,gust,temp,storm,rain,sunny,rainy,warm,mild}){
  const pick=arr=>arr[Math.floor(Math.abs(Math.sin(wind*13+gust*7+temp*3))*arr.length)%arr.length];
  if(storm)return pick(["Gewitter im Bereich – heute lieber an Land bleiben. Böen und rasche Wetteränderungen machen das Segeln gefährlich.","Achtung Gewitter! Das Boot bleibt heute im Hafen. Safety first – der See läuft nicht weg."]);
  if(wind>=23&&gust>=30)return pick([`Sehr kräftiger Wind mit Böen bis ${gust} kn. Für erfahrene Segler auf gut gerüstetem Boot – und auch dann mit Vorsicht.`,`${gust} kn Böen – heute ist nichts für schwache Nerven. Crew briefen, stark reffen oder zu Hause bleiben.`]);
  if(wind>=18&&rainy)return pick(["Starker Wind und Regen – kein schöner Tag auf dem See. Wer muss, reeft früh und bleibt nah am Ufer.","Rau und nass. Für Hartgesottene mit Ölzeug machbar, aber kein Tag zum Genuss-Segeln."]);
  if(wind>=18)return pick([`Kräftiger Wind mit Böen bis ${gust} kn. Sportlich und anspruchsvoll. Nur raus, wenn Crew und Material wirklich passen.`,`${gust} kn Böen – das zieht ordentlich. Für erfahrene Segler ein Erlebnis, für alle anderen lieber warten.`]);
  if(wind>=13&&rainy)return pick(["Ordentlich Wind, aber das Wetter spielt nicht mit. Mit Ölzeug und gesundem Respekt vor den Böen machbar.","Guter Wind, aber Regen. Wer trotzdem raus will: warme Klamotten, Ölzeug und Böen im Auge behalten."]);
  if(wind>=13)return pick([`Guter Druck im Segel, Böen bis ${gust} kn. Für geübte Segler ein schöner, aktiver Tag.`,"Schöner Fahrtwind heute – wer gut segeln kann, kommt voll auf seine Kosten. Reffen nicht vergessen!","Aktiver Segeltag mit gutem Wind. Boot trimmen, Böen beobachten und den See genießen."]);
  if(wind>=5&&sunny&&warm)return pick(["Traumhafter Segeltag! Genug Wind, Sonne und Wärme – Segel rauf und einfach genießen! ⛵☀️","Besser geht's nicht: guter Wind, blauer Himmel, warme Luft. Wer heute zu Hause bleibt, bereut es.","Perfekte Bedingungen – auf zum See! Wind stimmt, Sonne scheint, Wasser wartet.","So ein Tag macht Segler glücklich. Raus aus dem Hafen und den Starnberger See von seiner schönsten Seite erleben!"]);
  if(wind>=5&&sunny&&mild)return pick(["Schöne Bedingungen: Wind stimmt, Sonne zeigt sich. Ein entspannter Törn auf dem Starnberger See.","Gutes Segelwetter und Sonne dazu – ideal für einen entspannten Nachmittag auf dem Wasser.","Wind und Sonne – was will man mehr? Heute ist ein guter Tag, das Boot rauszuholen."]);
  if(wind>=5&&!rainy&&mild)return pick([`Solider Segeltag – genug Wind, Böen bis ${gust} kn im Auge behalten. Kein Traumwetter, aber gut auf dem Wasser.`,"Machbare Bedingungen, kein Bilderbuchsegelwetter – aber der Wind stimmt und das reicht für einen Törn.","Nicht perfekt, aber gut genug. Wind ist da, Böen im Rahmen – für eine Ausfahrt reicht das allemal."]);
  if(wind>=5&&rainy)return pick(["Der Wind würde es hergeben, aber der Regen trübt das Vergnügen. Für passionierte Segler machbar – Ölzeug nicht vergessen.","Wind ja, Wetter nein. Wer trotzdem raus will: Regenjacke an und die Böen im Blick behalten."]);
  if(wind>=5)return pick(["Etwas Wind, aber bescheidenes Wetter. Wer kann, wartet auf bessere Bedingungen.","Mäßiger Tag auf dem See. Nicht ideal, aber für eine kurze Ausfahrt okay."]);
  if(warm&&sunny)return pick(["Kaum Wind, aber Sonne und Wärme! Boje raus, Badehose an und den See genießen. 🏖️","Flaute – aber was für ein Wetter! Heute ist Boje- und Badetag. Das Boot kommt ein anderes Mal.","Segeln geht heute nicht, aber für einen Badetag ist das genau richtig! Sonne, Wärme, klares Wasser."]);
  if(warm)return pick(["Wenig Wind und warm – ein Lazy-Day auf dem See. Boje raus, schwimmen, Sonne tanken.","Flaute, aber angenehm warm. Motorboot oder einfach am Ufer sitzen und den See genießen."]);
  if(mild)return pick(["Zu wenig Wind zum aktiven Segeln. Schön zum Ankern und den Starnberger See in Ruhe auf sich wirken lassen.","Flautentag – ideal um das Boot zu putzen, Ausrüstung zu checken oder am Steg zu sitzen."]);
  return pick(["Flaute und kein tolles Wetter. Vielleicht morgen besser – einfach nochmal checken!","Kein Segeltag heute. Aber das Wetter dreht – morgen schon wieder neu schauen!"]);
}
// ===== Tagesverlauf-Text: analysiert Stundendaten und beschreibt den Verlauf =====
function dayProgressionText(hours, seedNum){
  if(!hours||hours.length<4) return null;
  // Blocks: früh 6-10, mittag 11-14, nachmittag 15-18, abend 19-22
  const inRange=(h,a,b)=>{const hr=new Date(h.time).getHours();return hr>=a&&hr<=b};
  const blocks={
    frueh:hours.filter(h=>inRange(h,6,10)),
    mittag:hours.filter(h=>inRange(h,11,14)),
    nachmittag:hours.filter(h=>inRange(h,15,18)),
    abend:hours.filter(h=>inRange(h,19,22)),
  };
  const avg=(arr,key)=>arr.length?arr.reduce((s,h)=>s+h[key],0)/arr.length:null;
  const maxRain=arr=>arr.length?Math.max(...arr.map(h=>h.rain||0)):0;
  const sunnyShare=arr=>arr.length?arr.filter(h=>h.weather_code<=2).length/arr.length:0;
  const stat=b=>b.length?{wind:avg(b,'wind'),gust:avg(b,'gust'),rain:maxRain(b),sun:sunnyShare(b),temp:avg(b,'temp')}:null;
  const f=stat(blocks.frueh), m=stat(blocks.mittag), n=stat(blocks.nachmittag), a=stat(blocks.abend);
  // deterministic picker per day so it stays varied but stable
  let seed=seedNum||0;
  const pick=arr=>arr[Math.floor(Math.abs(Math.sin(seed*97.13+arr.length*1.7))*arr.length)%arr.length];
  const rainy=x=>x&&x.rain>=45;
  const dry=x=>x&&x.rain<30;
  const sunnyB=x=>x&&x.sun>=0.5;
  const cloudy=x=>x&&x.sun<0.3;
  const windy=x=>x&&x.wind>=11;
  const calm=x=>x&&x.wind<6;
  const morn=f||m, mid=m||n, aft=n||m, eve=a||n;

  // --- Rain clearing: morning wet -> afternoon dry/sunny ---
  if(rainy(morn) && dry(aft)){
    const t=aft&&aft.temp!=null?Math.round(aft.temp):null;
    return pick([
      `Am Vormittag noch nass, ab dem Nachmittag wird's deutlich freundlicher${t?` (um ${t}°C)`:''}. Wer flexibel ist, fährt später raus – dann lohnt sich der Törn.`,
      `Morgens fällt noch Regen, doch zum Nachmittag reißt es auf. Geduld zahlt sich aus: Die zweite Tageshälfte ist die bessere.`,
      `Erst grau und feucht, dann klart es auf. Plane die Ausfahrt eher für Nachmittag und Abend ein.`,
      `Der Vormittag gehört noch dem Regen, danach kommt die Sonne durch. Ab Mittag wird's ein schöner Tag am Wasser.`,
    ]);
  }
  // --- Rain coming: morning nice -> afternoon wet ---
  if(dry(morn) && rainy(aft)){
    return pick([
      `Morgens noch trocken und brauchbar, am Nachmittag zieht Regen auf. Früh raus lohnt sich, später besser wieder am Steg sein.`,
      `Die erste Tageshälfte ist die schönere – ab Nachmittag wird's nass. Nutze den Vormittag.`,
      `Vormittags passt's, dann kommt der Regen. Wer raus will, sollte den Morgen nehmen und rechtzeitig zurück sein.`,
      `Start in einen freundlichen Tag, doch nachmittags trübt Regen die Stimmung. Früh planen!`,
    ]);
  }
  // --- Wind building through the day ---
  if(f&&aft && (aft.wind-f.wind)>=4 && aft.wind>=9){
    const wf=Math.round(f.wind), wa=Math.round(aft.wind);
    return pick([
      `Der Wind legt im Tagesverlauf zu: morgens entspannte ${wf} kn, am Nachmittag frische ${wa} kn. Ideal für sportliches Segeln später am Tag.`,
      `Früh noch wenig Zug (${wf} kn), am Nachmittag baut sich richtig Wind auf (${wa} kn). Wer's sportlich mag, wartet auf nachmittags.`,
      `Morgens sanft, nachmittags kräftig – der Wind nimmt von ${wf} auf ${wa} kn zu. Die beste Brise gibt's später.`,
      `Mit jeder Stunde mehr Wind: von ${wf} kn am Morgen auf ${wa} kn am Nachmittag. Plane danach, was du segeln willst.`,
    ]);
  }
  // --- Wind dying down ---
  if(f&&eve && (f.wind-eve.wind)>=4 && f.wind>=9){
    const wf=Math.round(f.wind), we=Math.round(eve.wind);
    return pick([
      `Früh am besten: morgens noch ${wf} kn, am Abend schläft der Wind auf ${we} kn ein. Wer segeln will, sollte vormittags los.`,
      `Der Wind nimmt im Lauf des Tages ab (von ${wf} auf ${we} kn). Die erste Hälfte ist die windreichere.`,
      `Morgens noch ordentlich Wind, abends nur noch laue Brise. Nutze den Vormittag fürs Segeln.`,
      `Vom frischen Morgen (${wf} kn) zur ruhigen Abendflaute (${we} kn). Früh raus lohnt sich am meisten.`,
    ]);
  }
  // --- Morning calm, afternoon usable wind ---
  if(calm(f) && aft&&aft.wind>=9){
    const wa=Math.round(aft.wind);
    return pick([
      `Morgens herrscht Flaute, ab Mittag kommt brauchbarer Wind (${wa} kn). Geduld lohnt sich – nachmittags wird's am See lebendig.`,
      `Früh kaum Zug im Segel, doch der Nachmittag bringt ${wa} kn. Lieber später rausfahren.`,
      `Vormittags spiegelglatt, nachmittags fängt der Wind an zu wehen. Die zweite Tageshälfte ist die bessere fürs Segeln.`,
    ]);
  }
  // --- Gewitter risk in part of the day ---
  if((m&&m.rain>=60)||(n&&n.rain>=60)){
    return pick([
      `Im Tagesverlauf steigt das Schauer- und Gewitterrisiko. Behalte den Himmel im Auge und plane die Rückkehr früh genug ein.`,
      `Vorsicht: nachmittags können Schauer aufziehen. Kurze Ausfahrt am Vormittag ist sicherer.`,
    ]);
  }
  // --- Warm calm day (Boje weather) - check before stable-sunny ---
  if(calm(f)&&calm(aft)&&morn&&morn.temp>=22){
    return pick([
      `Den ganzen Tag warm und windstill – perfektes Bojen- und Badewetter. Zum Segeln fehlt der Wind, zum Genießen ist alles da.`,
      `Kaum Wind, dafür durchgehend warm. Ein Tag für Anker, Baden und Sonne statt fürs Segeln.`,
      `Windstill und sommerlich von morgens bis abends. Boje raus und den See genießen.`,
    ]);
  }
  // --- Stable & sunny all day ---
  if(sunnyB(f)&&sunnyB(aft)&&dry(morn)&&dry(aft)){
    return pick([
      `Durchgehend sonnig und freundlich – egal wann du rausfährst, die Bedingungen passen den ganzen Tag.`,
      `Von früh bis spät schönes Wetter. Ein Tag, an dem jede Stunde auf dem Wasser Spaß macht.`,
      `Stabil und sonnig über den ganzen Tag. Du kannst flexibel planen, das Wetter spielt durchweg mit.`,
      `Den ganzen Tag Sonne satt. Ob Vormittag oder Abend – der See wartet bei besten Bedingungen.`,
    ]);
  }
  // --- Stable but cloudy/grey ---
  if(cloudy(f)&&cloudy(aft)&&dry(morn)&&dry(aft)){
    return pick([
      `Den ganzen Tag eher bewölkt, aber trocken. Gleichmäßige Bedingungen – kein Sonnenbrand, dafür verlässlich.`,
      `Durchgehend grau, aber kein Regen. Wer den Wind nutzen will, kann den ganzen Tag raus.`,
      `Wolkig und stabil von früh bis spät. Nicht das schönste Licht, aber gut planbar.`,
    ]);
  }
  // --- Generic fallback: describe morning vs afternoon briefly ---
  const part=(label,x)=>{
    if(!x)return null;
    const w=Math.round(x.wind);
    const sky=x.sun>=0.5?'sonnig':x.rain>=45?'nass':'wolkig';
    return `${label} ${sky}, ${w} kn`;
  };
  const segs=[part('vormittags',morn),part('nachmittags',aft)].filter(Boolean);
  if(segs.length===2){
    return pick([
      `Im Verlauf: ${segs[0]}; ${segs[1]}. Schau, welcher Zeitraum dir am besten passt.`,
      `Tendenz heute – ${segs[0]}, später ${segs[1].replace('nachmittags ','')}. Plane danach deine Ausfahrt.`,
    ]);
  }
  return null;
}

function estimateWaterTemps(daily,startTemp){let current=startTemp||18.0;return daily.time.slice(0,14).map((date,i)=>{const target=((daily.temperature_2m_max[i]+daily.temperature_2m_min[i])/2)-3.2;current=current+(target-current)*0.12;return{date,temp:Math.round(current*10)/10,code:daily.weather_code[i],real:i===0&&startTemp!=null}})}
async function fetchHistoricalWater(forecastDays){
  try{
    // Get past 7 days using Open-Meteo archive API (free, no key needed)
    const today=new Date();
    const end=new Date(today); end.setDate(end.getDate()-1);
    const start=new Date(today); start.setDate(start.getDate()-7);
    const fmt=d=>d.toISOString().slice(0,10);
    const params=new URLSearchParams({latitude:CONFIG.latitude,longitude:CONFIG.longitude,timezone:CONFIG.timezone,
      start_date:fmt(start),end_date:fmt(end),
      daily:"temperature_2m_max,temperature_2m_min"});
    const res=await fetch(`https://archive-api.open-meteo.com/v1/archive?${params}`);
    if(!res.ok)return null;
    const data=await res.json();
    return data.daily;
  }catch(e){return null}
}
async function buildWaterHistory(forecastDaily,realTodayTemp){
  const hist=await fetchHistoricalWater();
  const waterPast=[];
  if(hist&&hist.time&&hist.time.length>=3){
    // Build a map of available dates for gap detection
    const airMap={};
    hist.time.forEach((date,i)=>{airMap[date]={max:hist.temperature_2m_max[i],min:hist.temperature_2m_min[i]}});
    // Fill any gaps with interpolation between neighbours
    const allDates=[];
    const start=new Date(hist.time[0]), end=new Date(hist.time[hist.time.length-1]);
    for(let d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      const iso=d.toISOString().slice(0,10);
      allDates.push(iso);
      if(!airMap[iso]){
        // find prev and next known values
        const prev=allDates.slice(0,-1).reverse().find(x=>airMap[x]);
        const nextIdx=hist.time.findIndex(t=>t>iso);
        const nextDate=nextIdx>=0?hist.time[nextIdx]:null;
        if(prev&&nextDate){
          const p=airMap[prev],n={max:hist.temperature_2m_max[nextIdx],min:hist.temperature_2m_min[nextIdx]};
          airMap[iso]={max:(p.max+n.max)/2,min:(p.min+n.min)/2};
        } else if(prev){airMap[iso]=airMap[prev];}
      }
    }
    let seed=realTodayTemp?realTodayTemp-1.2:17.5;
    allDates.forEach(date=>{
      const air=airMap[date];
      if(!air)return;
      const target=(air.max+air.min)/2-3.2;
      seed=seed+(target-seed)*0.12;
      waterPast.push({date,temp:Math.round(seed*10)/10,real:true});
    });
    if(realTodayTemp&&waterPast.length){waterPast[waterPast.length-1].temp=realTodayTemp;}
  }
  const waterFuture=estimateWaterTemps(forecastDaily,realTodayTemp||undefined);
  return{past:waterPast,future:waterFuture};
}
async function fetchRealWaterTemp(){try{const url='https://www.nid.bayern.de/wassertemperatur/isar/starnberg-16663002';const proxy=`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;const res=await fetch(proxy);const json=await res.json();const html=json.contents;// Extract temperature from table: e.g. "18.0"
const match=html.match(/(\d{2}\.\d{2}\.\d{4} \d{2}:\d{2} Uhr[^<]*?<\/td>[^<]*<td[^>]*>([0-9]+(?:\.[0-9]+)?)<)/);if(match){const temp=parseFloat(match[2]);if(!isNaN(temp)&&temp>0&&temp<35)return temp;}// fallback: try simpler regex on the prominent display
const m2=html.match(/Max\. Tages-Wassertemperatur[^:]*:\s*<strong>([0-9.]+)<\/strong>/);if(m2)return parseFloat(m2[1]);return null}catch(e){return null}}
function buildHourlyByDate(hourly){const grouped={};hourly.time.forEach((time,i)=>{const date=time.slice(0,10);(grouped[date] ||= []).push({time,temp:hourly.temperature_2m[i],weather_code:hourly.weather_code[i],rain:hourly.precipitation_probability[i],wind:kmhToKn(hourly.wind_speed_10m[i]),gust:kmhToKn(hourly.wind_gusts_10m[i]),dir:windDirection(hourly.wind_direction_10m[i])})});return grouped}
const CACHE_KEY='stani_weather_cache';const CACHE_MAX_AGE=30*60*1000; // 30 Minuten
function saveCache(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({data,ts:Date.now()}))}catch(e){}}
function loadCache(){try{const raw=localStorage.getItem(CACHE_KEY);if(!raw)return null;const {data,ts}=JSON.parse(raw);if(Date.now()-ts>CACHE_MAX_AGE)return null;return data}catch(e){return null}}
function cacheAge(){try{const raw=localStorage.getItem(CACHE_KEY);if(!raw)return null;const {ts}=JSON.parse(raw);const mins=Math.round((Date.now()-ts)/60000);return mins}catch(e){return null}}
async function fetchFreshData(){const params=new URLSearchParams({latitude:CONFIG.latitude,longitude:CONFIG.longitude,timezone:CONFIG.timezone,forecast_days:CONFIG.forecastDays,current:"temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code",daily:"weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,sunrise,sunset,uv_index_max",hourly:"temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m,wind_direction_10m",wind_speed_unit:"kmh"});const res=await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);if(!res.ok)throw new Error("Forecast konnte nicht geladen werden");const data=await res.json();saveCache(data);return data}
async function loadData(forceRefresh=false){
  const cached=forceRefresh?null:loadCache();
  if(cached){
    // Sofort gecachte Daten anzeigen
    const age=cacheAge();
    $('updatedAt').textContent=`Zuletzt: vor ${age} Min (wird aktualisiert…)`;
    await render(cached);
    // Im Hintergrund neu laden wenn nötig (silent refresh)
    try{const fresh=await fetchFreshData();await render(fresh);}catch(e){$('updatedAt').textContent=`Zuletzt: vor ${age} Min (offline)`;}
  } else {
    const data=await fetchFreshData();
    await render(data);
  }
}
async function render(data){const d=data.daily;const days=d.time.map((time,i)=>({time,weather_code:d.weather_code[i],temperature_2m_max:d.temperature_2m_max[i],temperature_2m_min:d.temperature_2m_min[i],precipitation_probability_max:d.precipitation_probability_max[i],wind_speed_10m_max:d.wind_speed_10m_max[i],wind_gusts_10m_max:d.wind_gusts_10m_max[i],wind_direction_10m_dominant:d.wind_direction_10m_dominant[i],sunrise:d.sunrise?.[i],sunset:d.sunset?.[i],uv_index_max:d.uv_index_max?.[i]}));appState.days=days;appState.hourlyByDate=buildHourlyByDate(data.hourly);const realTemp=await fetchRealWaterTemp();const waterData=await buildWaterHistory(d,realTemp||undefined);appState.water=waterData.future;appState.waterPast=waterData.past;appState.realWaterTemp=realTemp;const today=classifyDay(days[0]),cur=data.current;$('updatedAt').textContent=`Aktualisiert: ${new Intl.DateTimeFormat('de-DE',{hour:'2-digit',minute:'2-digit'}).format(new Date())} Uhr`;$('todayDate').textContent=fmtLongDate(days[0].time);$('statusPill').textContent=today.title;$('statusPill').className=`status-pill ${today.tone}`;$('mainTitle').textContent=today.title;{const todayHours=(appState.hourlyByDate[days[0].time]||[]).filter(h=>{const hr=new Date(h.time).getHours();return hr>=6&&hr<=22});const prog=dayProgressionText(todayHours,0);$('mainText').textContent=prog?`${today.text} ${prog}`:today.text;}$('scoreSailing').textContent=`${today.sailing}/10`;$('scoreBathing').textContent=`${today.bathing}/10`;$('scoreBuoy').textContent=`${today.buoy}/10`;$('tempNow').textContent=`${Math.round(cur.temperature_2m)}°C`;$('tempRange').textContent=`${Math.round(days[0].temperature_2m_min)}–${Math.round(days[0].temperature_2m_max)}°C`;$('windNow').textContent=`${kmhToKn(cur.wind_speed_10m)} kn`;$('windDir').textContent=`${windDirection(cur.wind_direction_10m)} · max ${today.wind} kn`;$('gustNow').textContent=`${kmhToKn(cur.wind_gusts_10m)} kn`;$('gustRisk').textContent=today.gust>=25?'kräftig':'moderat';$('warningNow').textContent=[95,96,99].includes(cur.weather_code)?'Gewitter':'keine akute';$('warningText').textContent=weatherMap[cur.weather_code]||'Wetterlage';$('todayTomorrow').innerHTML=[days[0],days[1]].map((day,i)=>dayCard(day,i?'Morgen':'Heute',i)).join('');$('forecastList').innerHTML=days.map((day,i)=>forecastRow(day,i)).join('');document.querySelectorAll('[data-day-index]').forEach(el=>el.addEventListener('click',()=>openDaySheet(Number(el.dataset.dayIndex))));renderWater(days);renderWindMap(cur,days[0])}
function dayCard(day,label,index){const c=classifyDay(day);return`<article class="day-card glass clickable" data-day-index="${index}" tabindex="0"><div class="day-card-header"><h4>${label}</h4><span class="status-pill ${c.tone}">${esc(c.title)}</span></div><p>${esc(c.text)}</p><div class="day-badges"><span class="badge">${Math.round(day.temperature_2m_min)}–${Math.round(day.temperature_2m_max)}°C</span><span class="badge">Wind ${c.wind} kn</span><span class="badge">Böen ${c.gust} kn</span><span class="badge">${esc(weatherMap[day.weather_code]||'Wetter')}</span></div></article>`}
function forecastRow(day,index){const c=classifyDay(day);
  // Ampelfarben: grün/gelb/rot als subtiler Hintergrund
  const ampelBorder={green:'#30d158',yellow:'#ffd60a',red:'#ff453a'};
  const border=ampelBorder[c.tone]||'transparent';
  // Icon from afternoon hour (14:00) if available
  const pmHrs=getPMHours(day.time);
  const h14=pmHrs.find(h=>new Date(h.time).getHours()===14)||pmHrs[Math.floor(pmHrs.length/2)];
  const dispCode=h14?h14.weather_code:day.weather_code;
  return`<button class="forecast-row" data-day-index="${index}" style="border-left:4px solid ${border}"><div class="forecast-date">${esc(fmtDate(day.time))}</div><div class="forecast-main"><div class="forecast-title">${iconMap(dispCode)} ${esc(c.title)}</div><div class="forecast-sub">Wind ${c.wind} kn · Böen ${c.gust} kn · ${esc(weatherMap[dispCode]||'Wetter')}</div></div><div class="forecast-temp">${Math.round(day.temperature_2m_max)}°</div></button>`}
function renderWater(days){const water=appState.water;$('waterTodayDate').textContent=fmtLongDate(water[0].date);$('waterTemp').textContent=`${water[0].temp.toFixed(1)} °C`;$('waterTrend').textContent=water[1].temp>water[0].temp?'steigend':'fallend';{const delta=water[5].temp-water[0].temp;$('waterForecastTrend').textContent=`${delta>=0?'+':''}${delta.toFixed(1)}°`;}$('waterLevel').textContent='HND Bayern';const hours=[6,9,11,13,15,17,19,21];$('waterTodayBars').innerHTML=hours.map((h,i)=>{const t=Math.round((water[0].temp+Math.sin((i-2)/7*Math.PI)*0.55+(i-3)*0.08)*10)/10;return`<div class="bar-item"><span class="bar-temp">${t.toFixed(1)}°</span><i class="bar" style="height:${clamp((t-16)*12,20,70)}px"></i><span class="bar-label">${h}</span></div>`}).join('');// Use real historical past data if available, else fall back to future forecast reversed
const past=appState.waterPast&&appState.waterPast.length>=3?appState.waterPast:null;if(past){// past (7 days ago→yesterday) + today
const chartData=[...past,{date:water[0].date,temp:water[0].temp,real:!!appState.realWaterTemp}];renderLineChart(chartData,'Verlauf letzte 7 Tage')}else{renderLineChart(water.slice(0,7),'Verlauf (geschätzt)')}$('waterForecast').innerHTML=water.slice(1,6).map((w,i)=>`<div class="water-day"><b>${fmtDate(w.date).split(',')[0]}</b><strong>${w.temp.toFixed(1)}°</strong><span>${iconMap(days[i+1]?.weather_code||0)}</span></div>`).join('');$('waterNote').textContent=appState.realWaterTemp?`Messwert von NID Bayern (Starnberg). Tagesverlauf geschätzt aus Messung + Wettertrend.`:`Schätzung aus Wettertrend. Für echte Messwerte: NID Bayern Quelle (Link unten).`;}
function renderLineChart(vals){
  const w=520,h=150,pL=38,pR=18,pT=22,pB=34;
  const min=Math.floor(Math.min(...vals.map(v=>v.temp))-0.8),max=Math.ceil(Math.max(...vals.map(v=>v.temp))+0.8);
  const x=i=>pL+i*(w-pL-pR)/(vals.length-1);
  const y=t=>h-pB-(t-min)*(h-pT-pB)/(max-min||1);
  const points=vals.map((v,i)=>`${x(i)},${y(v.temp)}`).join(' ');
  const dayShort=d=>new Intl.DateTimeFormat('de-DE',{weekday:'short'}).format(new Date(d)).replace('.', '');
  const dayNum=d=>new Intl.DateTimeFormat('de-DE',{day:'2-digit',month:'2-digit'}).format(new Date(d));
  $('waterWeekLine').innerHTML=`<svg viewBox="0 0 ${w} ${h}" role="img">
    <line x1="${pL}" y1="${y(min)}" x2="${w-pR}" y2="${y(min)}" stroke="rgba(102,112,133,.18)"/>
    <line x1="${pL}" y1="${y(max)}" x2="${w-pR}" y2="${y(max)}" stroke="rgba(102,112,133,.18)"/>
    <text x="2" y="${y(max)+4}" class="axis-text">${max}°C</text>
    <text x="2" y="${y(min)+4}" class="axis-text">${min}°C</text>
    <polyline points="${points}" fill="none" stroke="#0a84ff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${vals.map((v,i)=>`<circle cx="${x(i)}" cy="${y(v.temp)}" r="5.5" fill="#0a84ff"/><text x="${x(i)-16}" y="${y(v.temp)-10}" class="point-label">${v.temp.toFixed(1)}°</text><text x="${x(i)-16}" y="${h-17}" class="axis-text">${dayShort(v.date)}</text><text x="${x(i)-18}" y="${h-4}" class="axis-text">${dayNum(v.date)}</text>`).join('')}
  </svg>`
}
function arrowIcon(bearing, speed, size=32){
  return L.divIcon({className:"",iconSize:[size,size+16],iconAnchor:[size/2,size/2+8],
    html:`<div style="display:flex;flex-direction:column;align-items:center;gap:1px">
      <div style="width:${size}px;height:${size}px;display:grid;place-items:center;font-size:${Math.round(size*0.85)}px;font-weight:950;color:#111;line-height:1;filter:drop-shadow(0 0 3px rgba(255,255,255,0.9))">
        <span style="display:block;transform:rotate(${bearing}deg)">↑</span>
      </div>
      <span style="font-size:9px;font-weight:900;color:#111;background:rgba(255,255,255,0.82);border-radius:999px;padding:1px 5px;line-height:1.5;white-space:nowrap">${speed} kn</span>
    </div>`
  })
}
// 6 Punkte im See: je 2 pro Zone (Nord/Mitte/Süd)
// Starnberger See Mittellinie: lon ca. 11.325 im Norden, 11.307 in der Mitte, 11.300 im Süden
const LAKE_ZONES=[
  {pts:[[47.990,11.328],[47.972,11.322]],zone:0}, // Nord
  {pts:[[47.945,11.315],[47.918,11.308]],zone:1}, // Mitte
  {pts:[[47.888,11.302],[47.858,11.298]],zone:2}, // Süd
];
function zoneWind(cur,day,i){const baseWind=kmhToKn(cur.wind_speed_10m||day.wind_speed_10m_max),baseGust=kmhToKn(cur.wind_gusts_10m||day.wind_gusts_10m_max),direction=cur.wind_direction_10m??day.wind_direction_10m_dominant??0;return{name:["Nord · Starnberg/Ambach","Mitte · Possenhofen/Feldafing","Süd · Tutzing/Seeshaupt"][i],wind:baseWind+[0,1,2][i],gust:baseGust+[0,2,4][i],direction,bearing:windToBearing(direction)}}
function renderWindMap(cur,day){if(!window.L||!$('windMap'))return;const direction=cur.wind_direction_10m??day.wind_direction_10m_dominant??0,bearing=windToBearing(direction);$('mapWindDir').textContent=windDirectionLong(direction);$('mapWindMeta').textContent=`${kmhToKn(cur.wind_speed_10m)} kn · Böen ${kmhToKn(cur.wind_gusts_10m)} kn`;$('mapWindLabel').textContent=`${windDirection(direction)} · ${kmhToKn(cur.wind_speed_10m)} kn`;$('compassArrow').style.transform=`rotate(${bearing}deg)`;if(!appState.map){appState.map=L.map('windMap',{zoomControl:false,scrollWheelZoom:false,dragging:true,tap:true}).setView([47.918,11.298],11);L.control.zoom({position:'topright'}).addTo(appState.map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; OpenStreetMap'}).addTo(appState.map)}if(appState.windLayer)appState.windLayer.remove();appState.windLayer=L.layerGroup().addTo(appState.map);LAKE_ZONES.forEach(({pts,zone})=>{const z=zoneWind(cur,day,zone);pts.forEach(pt=>L.marker(pt,{icon:arrowIcon(z.bearing,z.wind),interactive:false}).addTo(appState.windLayer));});$('windZones').innerHTML=[0,1,2].map(i=>zoneWind(cur,day,i)).map(z=>`<div class="zone-row"><div class="zone-icon"><b style="transform:rotate(${z.bearing}deg)">↑</b></div><div><strong>${esc(z.name)}</strong><span>${esc(windDirectionLong(z.direction))}</span></div><div class="zone-value">${z.wind} kn<br><span>Böen ${z.gust} kn</span></div></div>`).join('');setTimeout(()=>appState.map.invalidateSize(),100)}
const knots=[['Palstek','Feste Schlaufe, die sich nicht zuzieht.','Einfach',['Eine kleine Schlaufe legen.','Das lose Ende kommt durch die Schlaufe.','Um das stehende Ende herumführen.','Zurück durch die Schlaufe und festziehen.'],'https://www.animatedknots.com/bowline-knot'],['Achtknoten','Stopperknoten gegen Ausrauschen.','Einfach',['Bucht legen.','Loseseil über das stehende Ende führen.','Einmal herum und durch die Öffnung stecken.','Sauber festziehen.'],'https://www.animatedknots.com/figure-8-knot'],['Kreuzknoten','Verbindet zwei gleich starke Leinen.','Einfach',['Rechts über links.','Links über rechts.','Beide Enden parallel sortieren.','Gleichmäßig dicht ziehen.'],'https://www.animatedknots.com/square-knot'],['Schotstek','Verbindet zwei Leinen, auch unterschiedlich stark.','Mittel',['Mit der dickeren Leine eine Bucht bilden.','Dünnere Leine von unten durch die Bucht.','Um beide Teile der Bucht herumführen.','Unter sich selbst durchstecken und festziehen.'],'https://www.animatedknots.com/sheet-bend-knot'],['Doppelter Schotstek','Wie Schotstek, aber sicherer bei Last.','Mittel',['Bucht bilden.','Lose Leine durch und herumführen.','Noch ein zweites Mal herumführen.','Unter sich selbst durch und festziehen.'],'https://www.animatedknots.com/double-sheet-bend-knot'],['Webeleinstek','Zum Befestigen an Poller, Pfosten oder Ring.','Einfach',['Leine um den Pfosten legen.','Zweite Runde überkreuzt legen.','Ende unter der Kreuzung durchziehen.','Belasten und prüfen.'],'https://www.animatedknots.com/clove-hitch-rope-end-knot'],['Rundtörn mit zwei halben Schlägen','Zum Festmachen an Pollern oder Bäumen.','Einfach',['Einmal komplett um den festen Punkt.','Noch eine Runde für Reibung.','Ersten halben Schlag legen.','Zweiten halben Schlag sichern.'],'https://www.animatedknots.com/round-turn-two-half-hitches-knot'],['Stopperstek','Klemmt auf einer belasteten Leine.','Einfach',['Leine zweimal in Zugrichtung wickeln.','Eine weitere Runde gegenläufig legen.','Ende unter der letzten Runde durch.','Belasten, damit er klemmt.'],'https://www.animatedknots.com/rolling-hitch-knot'],['Belegen auf der Klampe','Sicheres Belegen an der Klampe.','Mittel',['Leine einmal um die Basis.','Acht über die Hörner legen.','Zweite Acht legen.','Letzte Runde als Kopfschlag sichern.'],'https://www.animatedknots.com/cleat-hitch-halyard-knot'],['Ankerstich','Zum Befestigen des Ankers am Tau.','Einfach',['Leine durch Ring oder Öse.','Beide Teile zurückführen.','Enden durch die entstandene Bucht.','Festziehen und Last testen.'],'https://www.animatedknots.com/anchor-hitch-knot']];
// Wikimedia Commons - verified filenames (CC-BY-SA)
// Using upload.wikimedia.org direct thumbnail URLs which work in browsers
function knotImgUrl(i){
  const files=[
    '9/9c/Palstek_innen.jpg',                    // 1. Palstek
    'a/a5/Knot-figure8.jpg',                     // 2. Achtknoten
    '5/5b/Reef_knot.jpg',                        // 3. Kreuzknoten
    'f/f5/Sheet_bend.jpg',                       // 4. Schotstek
    'c/c7/Double_sheet_bend.jpg',               // 5. Doppelter Schotstek
    'b/bc/Clove_hitch_knot.jpg',               // 6. Webeleinstek
    '5/5e/Round_turn_and_two_half-hitches.jpg', // 7. Rundtörn
    '5/59/Rolling_hitch.jpg',                   // 8. Stopperstek
    'c/c1/Cleat_hitch.jpg',                     // 9. Klampe
    'b/bb/Anchor_bend.jpg',                     // 10. Ankerstich
  ];
  return`https://upload.wikimedia.org/wikipedia/commons/thumb/${files[i]||files[0]}/200px-${files[i]?.split('/').pop()||'Palstek_innen.jpg'}`;
}
function knotThumb(i){return`<img src="${knotImgUrl(i)}" alt="${knots[i][0]}" style="width:100%;height:100%;object-fit:contain;border-radius:12px;" loading="lazy" onerror="this.style.display='none';this.nextSibling.style.display='grid'">${knotSVGFallback(i)}`}
function knotSVG(i){return knotThumb(i)}
function knotSVGFallback(i){
  const blue='#0a84ff', cyan='#64d2ff', red='#ff453a', grey='#94a3b8', dark='#0b1220';
  const common='fill="none" stroke-linecap="round" stroke-linejoin="round"';
  const svgs=[
    // Palstek
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M22 76 C55 55,75 55,98 76 C120 98,152 98,174 76 C194 56,190 34,168 30 C142 26,122 45,103 66" ${common} stroke="${blue}" stroke-width="12"/><path d="M108 66 C88 42,62 40,42 58" ${common} stroke="${grey}" stroke-width="9"/><circle cx="115" cy="72" r="28" ${common} stroke="${dark}" stroke-width="5" opacity=".18"/></svg>`,
    // Achtknoten
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M25 60 C55 22,95 25,110 60 C125 95,165 98,195 60" ${common} stroke="${cyan}" stroke-width="12"/><path d="M25 60 C55 98,95 95,110 60 C125 25,165 22,195 60" ${common} stroke="${grey}" stroke-width="9"/><path d="M72 35 C102 72,118 72,148 35" ${common} stroke="${blue}" stroke-width="7" opacity=".9"/></svg>`,
    // Kreuzknoten
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M20 42 C58 42,82 78,110 78 C138 78,162 42,200 42" ${common} stroke="${red}" stroke-width="12"/><path d="M20 78 C58 78,82 42,110 42 C138 42,162 78,200 78" ${common} stroke="${grey}" stroke-width="9"/><path d="M88 58 L132 58" ${common} stroke="${dark}" stroke-width="5" opacity=".16"/></svg>`,
    // Schotstek
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M45 82 C30 58,45 35,72 35 C102 35,102 85,72 85 C48 85,35 72,45 55" ${common} stroke="${grey}" stroke-width="11"/><path d="M130 20 C112 44,94 50,72 58 C110 64,126 76,139 100" ${common} stroke="${blue}" stroke-width="11"/><path d="M74 58 C114 53,137 50,186 62" ${common} stroke="${blue}" stroke-width="8" opacity=".9"/></svg>`,
    // Doppelter Schotstek
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M42 86 C28 60,43 32,75 32 C108 32,108 88,75 88 C50 88,36 74,44 54" ${common} stroke="${grey}" stroke-width="11"/><path d="M132 18 C112 40,94 48,74 58 C112 64,132 75,143 102" ${common} stroke="${cyan}" stroke-width="10"/><path d="M73 49 C112 47,138 50,184 58" ${common} stroke="${cyan}" stroke-width="7"/><path d="M76 69 C112 72,140 73,186 65" ${common} stroke="${blue}" stroke-width="7"/></svg>`,
    // Webeleinstek
    `<svg viewBox="0 0 220 120" aria-hidden="true"><rect x="95" y="18" width="30" height="84" rx="15" fill="#dbeafe" stroke="#94a3b8" stroke-width="4"/><path d="M24 45 C65 45,73 75,110 75 C147 75,155 45,196 45" ${common} stroke="${red}" stroke-width="10"/><path d="M24 75 C65 75,73 45,110 45 C147 45,155 75,196 75" ${common} stroke="${grey}" stroke-width="8"/></svg>`,
    // Rundtörn mit zwei halben Schlägen
    `<svg viewBox="0 0 220 120" aria-hidden="true"><circle cx="78" cy="60" r="28" fill="#dbeafe" stroke="#94a3b8" stroke-width="5"/><path d="M20 60 C44 60,48 31,78 31 C110 31,110 89,78 89 C48 89,44 60,78 60 C112 60,126 42,148 48 C166 53,172 75,155 84" ${common} stroke="${blue}" stroke-width="10"/><path d="M150 48 C174 43,194 52,202 74" ${common} stroke="${grey}" stroke-width="8"/></svg>`,
    // Stopperstek
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M20 60 H200" ${common} stroke="${grey}" stroke-width="9"/><path d="M68 88 C58 68,58 52,76 42 C92 34,113 42,108 60 C103 78,76 78,78 58 C81 37,116 32,136 48 C154 62,146 82,126 85" ${common} stroke="${blue}" stroke-width="9"/><path d="M134 84 L183 98" ${common} stroke="${blue}" stroke-width="9"/></svg>`,
    // Klampe
    `<svg viewBox="0 0 220 120" aria-hidden="true"><path d="M55 40 H165 M70 40 L40 70 M150 40 L180 70 M70 80 H150" ${common} stroke="#94a3b8" stroke-width="10"/><path d="M28 88 C62 58,92 58,110 78 C128 98,160 95,192 54" ${common} stroke="${cyan}" stroke-width="10"/><path d="M62 58 C92 92,132 92,160 58" ${common} stroke="${blue}" stroke-width="7"/></svg>`,
    // Ankerstich
    `<svg viewBox="0 0 220 120" aria-hidden="true"><circle cx="110" cy="54" r="25" fill="none" stroke="#94a3b8" stroke-width="7"/><path d="M45 95 C80 72,92 54,110 54 C128 54,140 72,175 95" ${common} stroke="${blue}" stroke-width="11"/><path d="M65 20 C88 46,93 54,110 54 C127 54,132 46,155 20" ${common} stroke="${grey}" stroke-width="9"/></svg>`
  ];
  return svgs[i]||svgs[0];
}
function renderKnots(){if($('knotList').children.length)return;$('knotList').innerHTML=knots.map((k,i)=>`<button class="knot-row" data-knot="${i}"><div class="knot-thumb">${knotSVG(i)}</div><div><h4>${i+1}. ${esc(k[0])}</h4><p>${esc(k[1])}</p></div><span class="level ${k[2]==='Mittel'?'mid':''}">${k[2]}</span></button>`).join('');document.querySelectorAll('[data-knot]').forEach(b=>b.addEventListener('click',()=>openKnot(Number(b.dataset.knot))))}
function openKnot(i){const k=knots[i];$('knotTitle').textContent=k[0];$('knotUse').textContent=k[2];$('knotVisual').innerHTML=`<img src="${knotImgUrl(i)}" alt="${esc(k[0])}" style="max-width:100%;max-height:200px;object-fit:contain;border-radius:16px;" loading="lazy" onerror="this.src='';this.style.display='none'">`;$('knotDesc').textContent=k[1];$('knotSteps').innerHTML=k[3].map((s,j)=>`<div class="knot-step"><b>${j+1}</b><span>${esc(s)}</span></div>`).join('')+(k[4]?`<a href="${esc(k[4])}" target="_blank" rel="noreferrer" class="knot-link-btn">▶ Animation auf animatedknots.com</a>`:'');openSheet('knotSheet')}
function openDaySheet(index){const day=appState.days[index];if(!day)return;const c=classifyDay(day);const hours=(appState.hourlyByDate[day.time]||[]).filter(h=>new Date(h.time).getHours()>=6&&new Date(h.time).getHours()<=22);$('sheetDate').textContent=fmtLongDate(day.time);$('sheetTitle').textContent=c.title;const prog=dayProgressionText(hours,index+1);$('sheetSummary').textContent=prog?`${c.text} ${prog}`:c.text;$('hourlyList').innerHTML=hours.map(h=>`<div class="hour-row"><div class="hour-time">${fmtHour(h.time)}</div><div class="hour-weather"><strong>${iconMap(h.weather_code)} ${esc(weatherMap[h.weather_code]||'Wetter')}</strong><span>${Math.round(h.temp)}°C · Regen ${h.rain??0}%</span></div><div class="hour-wind"><strong>${h.wind} kn</strong><span>Böen ${h.gust} kn · ${h.dir}</span></div></div>`).join('')||'<p class="sheet-summary">Für diesen Tag liegen keine Stundenwerte vor.</p>';openSheet('daySheet')}
function openSheet(id){const el=$(id);if(!el)return;el.classList.add('open');el.setAttribute('aria-hidden','false');document.body.classList.add('sheet-open')}function closeSheet(id){const el=$(id);if(!el)return;el.classList.remove('open');el.setAttribute('aria-hidden','true');document.body.classList.remove('sheet-open')}
function setupTabs(){const buttons=document.querySelectorAll('.tab-button[data-tab]'),panels=document.querySelectorAll('.tab-panel');buttons.forEach(btn=>btn.addEventListener('click',()=>{const tab=btn.dataset.tab;buttons.forEach(b=>{const a=b===btn;b.classList.toggle('active',a);b.setAttribute('aria-selected',a?'true':'false')});panels.forEach(p=>p.classList.toggle('active',p.id===`tab-${tab}`));if(tab==='wind'&&appState.map)setTimeout(()=>appState.map.invalidateSize(),120);window.scrollTo({top:0,behavior:'smooth'})}))}
async function boot(forceRefresh=false){try{await loadData(forceRefresh)}catch(e){console.error(e);$('mainTitle').textContent='Keine Verbindung';$('mainText').textContent='Die Live-Daten konnten nicht geladen werden. Prüfe Internet oder API-Zugriff.'}}
$('refreshBtn').addEventListener('click',()=>boot(true));document.querySelectorAll('[data-close-sheet]').forEach(el=>el.addEventListener('click',()=>closeSheet('daySheet')));document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSheet('daySheet')}});setupTabs();if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});boot();

// ============================================================
// LOGBUCH
// ============================================================
const LOGBUCH_KEY = 'stani_logbuch_v1';

function loadLogbuch() {
  try { return JSON.parse(localStorage.getItem(LOGBUCH_KEY) || '[]'); } catch(e) { return []; }
}
function saveLogbuch(entries) {
  try { localStorage.setItem(LOGBUCH_KEY, JSON.stringify(entries)); } catch(e) {}
}

function fmtDuration(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}
function calcDistance(coords) {
  if (coords.length < 2) return 0;
  let d = 0;
  for (let i = 1; i < coords.length; i++) {
    const R = 6371, [lat1,lon1] = coords[i-1], [lat2,lon2] = coords[i];
    const dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    d += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
  return d;
}

function renderLogbuch() {
  const entries = loadLogbuch();
  const list = $('logbuchList');
  const stats = $('logbuchStats');
  const totalKm = entries.reduce((s,e) => s + (e.distance||0), 0);
  stats.textContent = `${entries.length} Einträge · ${totalKm.toFixed(1)} km`;

  if (!entries.length) {
    list.innerHTML = `<div class="logbuch-empty"><div>⛵</div><p>Noch keine Törns eingetragen.<br>Starte deinen ersten Eintrag!</p></div>`;
    return;
  }
  list.innerHTML = entries.slice().reverse().map((e, ri) => {
    const i = entries.length - 1 - ri;
    const tags = [`🌬️ ${e.wind} kn`, `💨 Böen ${e.gust} kn`, `🌡️ ${e.temp}°C`, e.distance ? `📏 ${e.distance.toFixed(1)} km` : null, e.maxSpeed ? `⚡ max. ${e.maxSpeed} kn` : null].filter(Boolean);
    return `<button class="logbuch-entry" onclick="openLogEntry(${i})">
      <div class="logbuch-entry-header">
        <div>
          <div class="logbuch-entry-date">${esc(e.date)} · ${esc(e.time)} Uhr</div>
          <div class="logbuch-entry-title">${esc(e.weatherIcon||'⛵')} ${esc(e.weather||'Törn')}</div>
        </div>
        <div>
          <div class="logbuch-entry-dist">${e.distance ? e.distance.toFixed(1)+' km' : '—'}</div>
          <div class="logbuch-entry-dur">${e.duration||'—'}</div>
        </div>
      </div>
      <div class="logbuch-tags">${tags.map(t=>`<span class="logbuch-tag">${esc(t)}</span>`).join('')}</div>
      ${e.note ? `<div class="logbuch-note">${esc(e.note)}</div>` : ''}
    </button>`;
  }).join('');
}

function openLogEntry(index) {
  const entries = loadLogbuch();
  const e = entries[index];
  if (!e) return;
  $('detailDate').textContent = `${e.date} · ${e.time} Uhr`;
  $('detailTitle').textContent = `${e.weatherIcon||'⛵'} ${e.weather||'Törn'}`;
  const stats = [
    ['🌬️ Wind', `${e.wind} kn · ${e.windDir||''}`],
    ['💨 Böen', `${e.gust} kn`],
    ['🌡️ Temperatur', `${e.temp}°C`],
    ['📏 Distanz', e.distance ? `${e.distance.toFixed(1)} km` : '—'],
    ['⏱️ Dauer', e.duration||'—'],
    ['⚡ Max. Speed', e.maxSpeed ? `${e.maxSpeed} kn` : '—'],
  ];
  $('detailContent').innerHTML = `
    <div class="detail-stats-grid">${stats.map(([l,v])=>`<div class="detail-stat"><small>${esc(l)}</small><strong>${esc(v)}</strong></div>`).join('')}</div>
    ${e.photo ? `<img class="detail-photo" src="${e.photo}" alt="Foto vom Törn">` : ''}
    ${e.note ? `<div class="detail-note-box"><div class="detail-note-label">Notiz</div><div class="detail-note-text">${esc(e.note)}</div></div>` : ''}
    <button class="detail-delete-btn" onclick="deleteLogEntry(${index})">Eintrag löschen</button>
  `;
  openSheet('detailSheet');
}

function deleteLogEntry(index) {
  if (!confirm('Diesen Eintrag wirklich löschen?')) return;
  const entries = loadLogbuch();
  entries.splice(index, 1);
  saveLogbuch(entries);
  closeSheet('detailSheet');
  renderLogbuch();
}

// ---- Neuer Eintrag ----
let trackingInterval = null, trackingStart = null, trackCoords = [], trackSpeeds = [];

function openNewEntry() {
  // Auto-import aktuelles Wetter
  const cur = appState.current;
  if (cur) {
    const code = cur.weather_code || 0;
    $('entryWeatherIcon').textContent = iconMap(code);
    $('entryWindVal').textContent = `${kmhToKn(cur.wind_speed_10m)} kn`;
    $('entryWindDir').textContent = degToDir(cur.wind_direction_10m);
    $('entryTempVal').textContent = `${Math.round(cur.temperature_2m)}°C`;
    $('entryGustVal').textContent = `${kmhToKn(cur.wind_gusts_10m)} kn`;
  }
  $('entryNote').value = '';
  $('entryPhotoPreview').textContent = '📸 Foto hinzufügen';
  stopTracking();
  openSheet('newEntrySheet');
}

function startTracking() {
  if (!navigator.geolocation) { alert('GPS nicht verfügbar auf diesem Gerät.'); return; }
  trackCoords = []; trackSpeeds = []; trackingStart = Date.now();
  $('trackingStatus').style.display = 'none';
  $('trackingActive').style.display = 'block';
  trackingInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - trackingStart) / 1000);
    const m = Math.floor(elapsed / 60), s = elapsed % 60;
    $('trackTime').textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    const dist = calcDistance(trackCoords);
    $('trackDist').textContent = `${dist.toFixed(1)} km`;
    const maxSpd = trackSpeeds.length ? Math.max(...trackSpeeds) : 0;
    $('trackSpeed').textContent = `${maxSpd} kn`;
  }, 1000);
  navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lon, speed } = pos.coords;
    trackCoords.push([lat, lon]);
    if (speed != null) trackSpeeds.push(Math.round(speed * 1.94384));
  }, null, { enableHighAccuracy: true, maximumAge: 5000 });
}

function stopTracking() {
  if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
  $('trackingStatus').style.display = 'block';
  $('trackingActive').style.display = 'none';
}

function saveEntry() {
  const cur = appState.current;
  const now = new Date();
  const days = ['So.','Mo.','Di.','Mi.','Do.','Fr.','Sa.'];
  const months = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  const code = cur?.weather_code || 0;
  const classif = appState.days?.[0] ? classifyDay(appState.days[0]) : {weather:'Törn',title:'Törn'};

  const dist = calcDistance(trackCoords);
  const duration = trackingStart ? fmtDuration(Math.floor((Date.now()-trackingStart)/1000)) : null;
  const maxSpeed = trackSpeeds.length ? Math.max(...trackSpeeds) : null;

  // Photo
  const photoFile = $('entryPhoto').files[0];
  const saveWithPhoto = (photoData) => {
    const entry = {
      date: `${days[now.getDay()]} ${now.getDate()}. ${months[now.getMonth()]} ${now.getFullYear()}`,
      time: `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`,
      weather: classif.title,
      weatherIcon: iconMap(code),
      wind: cur ? kmhToKn(cur.wind_speed_10m) : 0,
      gust: cur ? kmhToKn(cur.wind_gusts_10m) : 0,
      windDir: cur ? degToDir(cur.wind_direction_10m) : '—',
      temp: cur ? Math.round(cur.temperature_2m) : 0,
      note: $('entryNote').value.trim(),
      distance: dist > 0.05 ? dist : null,
      duration: duration,
      maxSpeed: maxSpeed,
      track: trackCoords.length > 1 ? trackCoords : null,
      photo: photoData || null,
    };
    const entries = loadLogbuch();
    entries.push(entry);
    saveLogbuch(entries);
    stopTracking();
    closeSheet('newEntrySheet');
    renderLogbuch();
    // Switch to logbuch tab
    document.querySelector('[data-tab="logbuch"]').click();
  };

  if (photoFile) {
    const reader = new FileReader();
    reader.onload = e => saveWithPhoto(e.target.result);
    reader.readAsDataURL(photoFile);
  } else {
    saveWithPhoto(null);
  }
}

// Photo preview
// Logbuch listeners - use DOMContentLoaded for reliability
function initLogbuch() {
  const photoInput = $('entryPhoto');
  if (photoInput) photoInput.addEventListener('change', () => {
    const f = photoInput.files[0];
    $('entryPhotoPreview').textContent = f ? `📸 ${f.name}` : '📸 Foto hinzufügen';
  });
  const nb = $('newEntryBtn');
  if (nb) nb.addEventListener('click', openNewEntry);
  const sb = $('startTrackBtn');
  if (sb) sb.addEventListener('click', startTracking);
  const stb = $('stopTrackBtn');
  if (stb) stb.addEventListener('click', stopTracking);
  const seb = $('saveEntryBtn');
  if (seb) seb.addEventListener('click', saveEntry);
  document.querySelectorAll('[data-close-entry]').forEach(el => el.addEventListener('click', () => { stopTracking(); closeSheet('newEntrySheet'); }));
  document.querySelectorAll('[data-close-detail]').forEach(el => el.addEventListener('click', () => closeSheet('detailSheet')));
  renderLogbuch();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLogbuch);
} else {
  initLogbuch();
}
