/* MASS DESIGN REFERENCE — not a production implementation.
   This self-contained example demonstrates local persistence and core UX. */
(() => {
  'use strict';
  const KEY = 'mass-design-demo-v1';
  const KG_PER_LB = 0.45359237;
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const isoToday = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  };
  const parseDate = (s) => new Date(`${s}T12:00:00`);
  const fmt = (date, options) => parseDate(date).toLocaleDateString('en-GB', options);
  const round1 = (n) => Math.round((n + Number.EPSILON) * 10) / 10;
  const visibleWeight = (g, unit) => round1(unit === 'lb' ? g / 1000 / KG_PER_LB : g / 1000);
  const toGrams = (weight, unit) => Math.round((unit === 'lb' ? weight * KG_PER_LB : weight) * 1000);
  const weightText = (g, unit) => `${visibleWeight(g, unit).toFixed(1)} ${unit}`;
  const signed = (n, unit, decimals=1) => `${n > 0.000001 ? '+' : n < -0.000001 ? '−' : ''}${Math.abs(n).toFixed(decimals)} ${unit}`;
  const dateMinusDays = (date, days) => {const d = parseDate(date); d.setDate(d.getDate()-days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
  const today = isoToday();
  const sampleOffsets = [88,78,69,57,48,38,27,18,8,0];
  const sampleWeights = [60000,60300,60100,61000,60700,61600,61400,62100,62000,62400];
  const sampleRecords = sampleOffsets.map((d,i) => ({id:`sample-${i}`,date:dateMinusDays(today,d),grams:sampleWeights[i]}));
  let stored;
  try { stored = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { stored = null; }
  let state = stored && stored.version === 1 && Array.isArray(stored.records) ? stored : {version:1, unit:'kg', records:[], onboarded:false};
  let screen = 'overview';
  let selectedPeriod = '3M';
  let editingId = null;
  let demo = !stored;
  let toastTimeout;
  const hasRealRecords = () => state.records.length > 0;
  const records = () => (demo && !hasRealRecords() ? sampleRecords : state.records).slice().sort((a,b) => a.date.localeCompare(b.date));
  const save = () => { localStorage.setItem(KEY, JSON.stringify(state)); demo = false; };
  const showToast = (msg) => {clearTimeout(toastTimeout); const el=$('#toast'); el.textContent=msg; el.classList.add('visible'); toastTimeout=setTimeout(()=>el.classList.remove('visible'),2200);};
  const titleDate = (d) => fmt(d,{weekday:'long',month:'short',day:'numeric'}).toUpperCase().replace(',',' ·');
  function periodFiltered(all) {
    if (selectedPeriod === 'ALL') return all;
    const days = {'7D':7,'30D':30,'3M':90,'6M':180,'1Y':365}[selectedPeriod];
    const from = dateMinusDays(today, days-1);
    return all.filter(r => r.date >= from && r.date <= today);
  }
  const toValue = (g) => visibleWeight(g, state.unit);
  function renderOverview() {
    const all = records();
    const last = all[all.length-1];
    const previous = all[all.length-2];
    const within = periodFiltered(all);
    const firstPeriod = within[0], lastPeriod=within[within.length-1];
    const deltaGrams = firstPeriod && lastPeriod ? lastPeriod.grams - firstPeriod.grams : 0;
    const delta = state.unit === 'lb' ? deltaGrams/1000/KG_PER_LB : deltaGrams/1000;
    const days = firstPeriod && lastPeriod ? (parseDate(lastPeriod.date)-parseDate(firstPeriod.date))/86400000 : 0;
    const weekly = days > 0 ? delta / days * 7 : 0;
    $('#overviewDate').textContent = titleDate(today);
    $('#sampleTag').classList.toggle('hidden', !demo || hasRealRecords());
    $('#latestWeight').textContent = last ? toValue(last.grams).toFixed(1) : '—';
    $('#latestUnit').textContent = state.unit;
    $('#latestDate').textContent = last ? `Last recorded on ${fmt(last.date,{day:'numeric',month:'short',year:'numeric'})}` : 'No entries yet. Start with today.';
    $('#totalChange').innerHTML = within.length < 2 ? '—' : `${signed(delta,state.unit).replace(' '+state.unit,` <span>${state.unit}</span>`)}`;
    $('#weeklyChange').innerHTML = within.length < 2 || days <= 0 ? '—' : `${signed(weekly,state.unit).replace(' '+state.unit,` <span>${state.unit}</span>`)}`;
    $('#chartCount').textContent = `${within.length} ${within.length===1?'entry':'entries'}`;
    $('#recentValue').textContent = last ? weightText(last.grams,state.unit) : 'No measurement';
    $('#recentSub').textContent = last ? fmt(last.date,{day:'numeric',month:'short',year:'numeric'}) : 'Tap + to begin';
    const lastDelta = last && previous ? (last.grams-previous.grams)/1000/(state.unit==='lb'?KG_PER_LB:1) : 0;
    $('#recentDelta').textContent = previous ? signed(lastDelta,state.unit) : '—';
    $$('.period-btn').forEach(btn => {btn.classList.toggle('active',btn.dataset.period===selectedPeriod); btn.setAttribute('aria-pressed',String(btn.dataset.period===selectedPeriod))});
    renderChart(within);
  }
  function renderChart(entries) {
    const svg = $('#weightChart');
    $('#chartBlank').classList.toggle('hidden',entries.length >= 2);
    if(entries.length < 2) {svg.innerHTML='';return;}
    const vals = entries.map(r=>toValue(r.grams));
    const min = Math.min(...vals), max = Math.max(...vals);
    const spacing = Math.max((max-min)*.23, state.unit==='kg' ? .45 : 1);
    const floor=min-spacing, ceil=max+spacing;
    const left=9,right=313,top=15,bottom=166;
    const startTime=parseDate(entries[0].date).getTime();
    const endTime=parseDate(entries[entries.length-1].date).getTime();
    const px = r => left+(parseDate(r.date).getTime()-startTime)/Math.max(1,endTime-startTime)*(right-left);
    const py = r => bottom-(toValue(r.grams)-floor)/(ceil-floor)*(bottom-top);
    const points = entries.map(r=>[px(r),py(r)]);
    const path=points.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area=`${path} L${points[points.length-1][0]},${bottom} L${points[0][0]},${bottom} Z`;
    const horiz=[0,.33,.66,1].map(t=>{const y=top+(bottom-top)*t; const label=(ceil-(ceil-floor)*t).toFixed(1); return `<line x1="0" y1="${y}" x2="350" y2="${y}" stroke="#344138" stroke-dasharray="2 5"/><text x="349" y="${y-5}" text-anchor="end" fill="#77877a" font-size="9">${label}</text>`}).join('');
    const xTicks=[entries[0],entries[Math.floor((entries.length-1)/2)],entries[entries.length-1]].map((r,i)=>`<text x="${[0,160,320][i]}" y="199" text-anchor="${['start','middle','end'][i]}" fill="#9aa59b" font-size="10">${fmt(r.date,{day:'numeric',month:'short'})}</text>`).join('');
    const last=points[points.length-1];
    svg.innerHTML=`<defs><linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#c5f17c" stop-opacity=".21"/><stop offset="100%" stop-color="#c5f17c" stop-opacity="0"/></linearGradient></defs>${horiz}<path d="${area}" fill="url(#areaFill)"/><path d="${path}" fill="none" stroke="#c5f17c" stroke-width="2.7" stroke-linejoin="round" stroke-linecap="round"/>${points.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="#c5f17c"/>`).join('')}<circle cx="${last[0]}" cy="${last[1]}" r="7" fill="#c5f17c" opacity=".23"/><circle cx="${last[0]}" cy="${last[1]}" r="4" fill="#c5f17c"/>${xTicks}`;
  }
  function renderHistory(){
    const all=records();const newest=all.slice().reverse();
    $('#historyCount').textContent=all.length;
    $('#firstLogged').textContent=all.length?fmt(all[0].date,{day:'2-digit',month:'short'}):'—';
    const container=$('#historyEntries');
    if(!all.length){container.innerHTML='<div class="empty-state">Nothing logged yet.<br/>Tap the + button to add your first measurement.</div>';return;}
    const groups = new Map();
    newest.forEach((r)=>{const key=fmt(r.date,{month:'long',year:'numeric'});if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});
    container.innerHTML=[...groups].map(([month,rows])=>`<section class="history-group"><h2>${month}</h2>${rows.map(r=>{
      const index=all.findIndex(x=>x.id===r.id);const prev=all[index-1];const diff=prev ? (r.grams-prev.grams)/1000/(state.unit==='lb'?KG_PER_LB:1) : 0;
      const suffix=!prev?'First entry':signed(diff,state.unit);
      return `<button class="history-entry" data-edit-id="${r.id}"><span class="history-entry-left"><span class="day-number">${fmt(r.date,{day:'2-digit'})}</span><span class="day-detail"><span class="day-name">${fmt(r.date,{weekday:'long'})}</span><span class="day-full">${fmt(r.date,{day:'numeric',month:'long',year:'numeric'})}</span></span></span><span class="history-entry-right"><strong>${weightText(r.grams,state.unit)}</strong><small class="${!prev?'neutral':diff<0?'negative':''}">${suffix}</small></span></button>`;
    }).join('')}</section>`).join('');
    $$('[data-edit-id]').forEach(b=>b.addEventListener('click',()=>openLog(b.dataset.editId)));
  }
  function renderSettings(){
    $$('.unit-choice,.starter-unit').forEach(btn=>{btn.classList.toggle('selected',btn.dataset.unit===state.unit);btn.setAttribute('aria-pressed',String(btn.dataset.unit===state.unit))});
    $('#startingSuffix').textContent=state.unit;
  }
  function navigate(next) {
    screen=next;
    $$('.screen').forEach(el=>el.classList.toggle('active',el.id===`${next}Screen`));
    $('#bottomNav').classList.toggle('hidden',next==='onboarding');
    $('#settingsShortcut').classList.toggle('hidden',next==='onboarding');
    $$('.nav-item').forEach(btn=>btn.classList.toggle('selected',btn.dataset.nav===next));
    renderAll();
    $('.app-shell').scrollTo({top:0,behavior:'instant'});
  }
  function renderAll(){renderOverview();renderHistory();renderSettings();}
  function openLog(id=null){
    editingId=id;
    const record=id ? state.records.find(r=>r.id===id) || sampleRecords.find(r=>r.id===id) : null;
    $('#logTitle').innerHTML=`${record?'Edit entry':'Log weight'}<span class="serif-dot">.</span>`;
    $('#weightInput').value=record ? String(toValue(record.grams)) : '';
    $('#dateInput').value=record?record.date:today;
    $('#dateInput').max=today;
    $('#logSuffix').textContent=state.unit;
    const all=records();const last=all[all.length-1];
    $('#logContext').textContent=last?`Last recorded: ${weightText(last.grams,state.unit)} on ${fmt(last.date,{day:'numeric',month:'short'})}`:'This will be your first entry.';
    $('#deleteFromEditor').classList.toggle('hidden',!record || String(id).startsWith('sample-'));
    $('#logOverlay').classList.remove('hidden');
    document.body.style.overflow='hidden';
    setTimeout(()=>$('#weightInput').focus(),80);
  }
  function closeLog(){$('#logOverlay').classList.add('hidden');document.body.style.overflow='';editingId=null;}
  function logWeight(event){
    event.preventDefault();
    const unit=state.unit;
    const val=Number($('#weightInput').value);
    const date=$('#dateInput').value;
    const limit=unit==='kg'?635:1400;
    if(!Number.isFinite(val)||val<1||val>limit||!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today){showToast('Enter a valid weight and date');return;}
    const id=editingId && !String(editingId).startsWith('sample-') ? editingId : (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
    const clash=state.records.find(r=>r.date===date && r.id!==id);
    if(clash && !window.confirm(`An entry already exists for ${fmt(date,{day:'numeric',month:'short',year:'numeric'})}. Replace it?`))return;
    state.records=state.records.filter(r=>r.id!==id && r.id!==clash?.id);
    state.records.push({id,date,grams:toGrams(val,unit)});
    state.onboarded=true;save();closeLog();navigate('overview');showToast('Measurement saved');
  }
  function startOnboarding(){
    const val=$('#startingWeight').value.trim();
    if(val){const n=Number(val);const limit=state.unit==='kg'?635:1400;if(!Number.isFinite(n)||n<1||n>limit){showToast('Enter a valid starting weight');return}state.records=[{id:crypto.randomUUID ? crypto.randomUUID():String(Date.now()),date:today,grams:toGrams(n,state.unit)}]}
    state.onboarded=true;save();navigate('overview');showToast('You’re all set');
  }
  function exportCsv(){
    if(!hasRealRecords()){showToast('Log a weight before exporting');return;}
    const lines=['date,weight_kg,weight_lb',...state.records.slice().sort((a,b)=>a.date.localeCompare(b.date)).map(r=>`${r.date},${(r.grams/1000).toFixed(3)},${(r.grams/1000/KG_PER_LB).toFixed(3)}`)];
    const blob=new Blob([lines.join('\r\n')+'\r\n'],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='mass-weight-history.csv';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('CSV exported');
  }
  function clearData(){if(!window.confirm('Delete all entries stored in this browser? This cannot be undone.'))return;state.records=[];state.onboarded=true;save();navigate('overview');showToast('Entries cleared');}
  $$('.period-btn').forEach(btn=>btn.addEventListener('click',()=>{selectedPeriod=btn.dataset.period;renderOverview();}));
  $$('[data-nav]').forEach(btn=>btn.addEventListener('click',()=>navigate(btn.dataset.nav)));
  $('#settingsShortcut').addEventListener('click',()=>navigate('settings'));
  $('#addButton').addEventListener('click',()=>openLog());
  $('#closeLog').addEventListener('click',closeLog);
  $('[data-close-log]').addEventListener('click',closeLog);
  $('#weightForm').addEventListener('submit',logWeight);
  $('#getStarted').addEventListener('click',startOnboarding);
  $('#exportCsv').addEventListener('click',exportCsv);
  $('#clearData').addEventListener('click',clearData);
  $('#deleteFromEditor').addEventListener('click',()=>{if(!editingId||!window.confirm('Delete this measurement?'))return;state.records=state.records.filter(r=>r.id!==editingId);save();closeLog();navigate('history');showToast('Entry deleted');});
  $$('.unit-choice,.starter-unit').forEach(btn=>btn.addEventListener('click',()=>{state.unit=btn.dataset.unit;state.onboarded=state.onboarded||false; if(!demo)save();renderAll();}));
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#logOverlay').classList.contains('hidden'))closeLog()});
  // Design preview URLs: ?screen=overview|history|settings|onboarding|log|empty
  const requested=new URLSearchParams(location.search).get('screen');
  if(requested==='empty'){state.records=[];demo=false;navigate('overview')}
  else if(requested==='log'){navigate('overview');openLog()}
  else if(['overview','history','settings','onboarding'].includes(requested))navigate(requested);
  else navigate('overview');
})();
