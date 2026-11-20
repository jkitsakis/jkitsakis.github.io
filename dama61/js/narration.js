(()=>{
"use strict";
const NC=window.DAMA61_SITE_CONFIG?.narration||{};
if(location.protocol==='file:'){
 const warning=document.createElement('aside');warning.className='narration-launch-warning';warning.style.cssText='margin:12px;padding:14px;border:2px solid #d97706;border-radius:10px;background:#fffbeb;color:#713f12;font-weight:600';warning.textContent='Η αφήγηση απαιτεί τοπικό HTTP server. Άνοιξε το site μέσω run.bat και http://127.0.0.1:2023/ (όχι με διπλό κλικ σε HTML).';document.body.prepend(warning);
}
const synth=window.speechSynthesis;
const page=document.body.dataset.page||location.pathname.split('/').pop().replace(/\.html$/,'');
const section=document.body.dataset.section||(location.pathname.match(/\/section(\d+)\//)||[])[1]||'1';
const catalog=window.DAMA61_CATALOG||[];
let embedded=null;
try {
 const node=document.getElementById('dama61-page-catalog');
 if(node)embedded=JSON.parse(node.textContent);
} catch(e){console.error('DAMA61 narration: invalid page metadata',e);}
const group=(embedded?.id===page && String(embedded.section||1)===section)
 ? embedded : catalog.find(g=>g.id===page && String(g.section||1)===section);
if(!group){
 const error=document.createElement('aside');
 error.className='narration-launch-warning';
 error.textContent='Αφήγηση μη διαθέσιμη: λείπει ο κατάλογος μαθημάτων για '+page+'. Κάνε Build ALL και ανανέωση Ctrl+F5.';
 error.style.cssText='margin:12px;padding:14px;border:2px solid #d97706;border-radius:10px;background:#fffbeb;color:#713f12;font-weight:600';
 document.body.prepend(error);
 console.error('DAMA61 narration: catalog entry missing',page);
 return;
}
const storeKey='dama61-narr-progress-v4-section'+section+'-'+page;
const saved=(()=>{try{return JSON.parse(localStorage.getItem(storeKey))||{}}catch{return {}}})();
const chapters=[{title:group.full_title||'Ολόκληρο το μέρος',file:group.file},...group.lessons];
const bar=document.createElement('section');bar.className='narration-player';bar.setAttribute('aria-label','Εργαλείο αφήγησης');
bar.innerHTML=`<div class="narr-top"><strong>🎧 Αφήγηση από TXT</strong><span class="narr-help">Φυσική αφήγηση · πάτησε οποιαδήποτε παράγραφο</span><button type="button" data-act="expand" aria-expanded="true">Σύμπτυξη</button></div><div class="narr-body"><div class="narr-controls"><label>Μάθημα <select id="narr-chapter"></select></label><button type="button" data-act="play">▶ Αφήγηση</button><button type="button" data-act="pause">⏸ Παύση</button><button type="button" data-act="stop">■ Διακοπή</button><button type="button" data-act="prev" title="Προηγούμενη παράγραφος">◀ Προηγούμενη</button><button type="button" data-act="next" title="Επόμενη παράγραφος">Επόμενη ▶</button><label>Ελληνική φωνή <select id="narr-voice-el" aria-label="Ελληνική φωνή"></select></label><label>English voice <select id="narr-voice-en" aria-label="Αγγλική φωνή"></select></label><label>Εκφώνηση <select id="narr-language-mode"><option value="flow">Συνεχής ελληνική (προτεινόμενο)</option><option value="bilingual">Δίγλωσση (GR/EN)</option></select></label><label class="narr-follow-setting"><input type="checkbox" id="narr-auto-follow"> Auto-follow transcript</label><label>Ταχύτητα <select id="narr-speed"><option value="0.75">0.75×</option><option value="0.9">0.9×</option><option value="1" selected>1×</option><option value="1.15">1.15×</option><option value="1.3">1.3×</option><option value="1.5">1.5×</option></select></label><label class="narr-upload">📄 Άνοιγμα TXT <input type="file" accept=".txt,text/plain" id="narr-upload"></label><button type="button" data-act="reload">↻ Ανανέωση TXT</button><a id="narr-txt" download>Κατέβασε TXT</a></div><div class="narr-progress"><input type="range" min="1" max="1" value="1" id="narr-seek" aria-label="Επιλογή παραγράφου"><output id="narr-position">1 / 1</output><span id="narr-status" role="status">Έτοιμο</span></div><div class="narr-transcript"><div class="narr-transcript-title">Παράγραφοι transcript · κλικ για αφήγηση από εδώ</div><div class="narr-paragraphs" id="narr-paragraphs" tabindex="0"></div></div></div>`;
document.body.prepend(bar);
const $=s=>bar.querySelector(s), chapterSelect=$('#narr-chapter'),speed=$('#narr-speed'),seek=$('#narr-seek'),status=$('#narr-status'),pos=$('#narr-position'),textList=$('#narr-paragraphs'),voiceEL=$('#narr-voice-el'),voiceEN=$('#narr-voice-en'),autoFollow=$('#narr-auto-follow');
chapters.forEach((c,i)=>{const o=document.createElement('option');o.value=i;o.textContent=c.title;chapterSelect.append(o)});
let chapter=0, paragraphs=[],index=0,chunkIndex=0,active=false,paused=false,revision=0,currentFile='',custom=new Map(),loading=false;
speed.value=saved.speed||String(NC.speed||1);
const languageMode=$('#narr-language-mode');languageMode.value=NC.language_mode||'flow';
autoFollow.checked=saved.autoFollow===true || (saved.autoFollow===undefined && NC.auto_follow===true);
const save=()=>{try{localStorage.setItem(storeKey,JSON.stringify({chapter,index,chunkIndex,speed:speed.value,voiceEL:voiceEL.value,voiceEN:voiceEN.value,autoFollow:autoFollow.checked}))}catch{}};
const splitText=t=>t.replace(/\r\n?/g,'\n').split(/\n\s*\n+/).map(p=>p.replace(/\s*\n\s*/g,' ').trim()).filter(Boolean);
// Split each paragraph into natural Greek/English phrases; keep adjacent Latin terms together.
// Never split a Latin word itself (e.g. StandardScaler, GridSearchCV, Python).
function speechSegments(input){
 const text=String(input).replace(/\s+/gu,' ').trim();
 if(!text)return [];
 const latin=/[A-Za-z][A-Za-z0-9_]*(?:[-./+][A-Za-z0-9_]+)*(?:\(\))?/g;
 const matches=[...text.matchAll(latin)];
 if(!matches.length)return wrapSpeech(text,'el-GR');
 const segments=[];let cursor=0;
 for(let i=0;i<matches.length;){
  const match=matches[i],at=match.index;
  if(at>cursor)segments.push({text:text.slice(cursor,at),lang:'el-GR'});
  let finish=at+match[0].length,j=i+1;
  while(j<matches.length){
   const between=text.slice(finish,matches[j].index);
   // Allow spaces and common punctuation between English terms, but not Greek characters.
   if(!/^[\s,;:()\[\]–—&+\-]*$/u.test(between))break;
   finish=matches[j].index+matches[j][0].length;j++;
  }
  segments.push({text:text.slice(at,finish),lang:'en-US'});
  cursor=finish;i=j;
 }
 if(cursor<text.length)segments.push({text:text.slice(cursor),lang:'el-GR'});
 // Fold tiny pieces of punctuation into neighboring phrases.
 const merged=[];
 for(const seg of segments){
  if(!seg.text.trim() && merged.length){merged[merged.length-1].text+=seg.text;continue}
  if(merged.length&&merged[merged.length-1].lang===seg.lang)merged[merged.length-1].text+=seg.text;
  else merged.push({...seg});
 }
 return merged.flatMap(seg=>wrapSpeech(seg.text,seg.lang));
}
function wrapSpeech(text,lang){
 const words=text.match(/\S+\s*/gu)||[];
 let out=[],piece='';
 for(const word of words){if(piece&&piece.length+word.length>(NC.max_chunk_chars||220)){out.push({text:piece.trim(),lang});piece=''}piece+=word;}
 if(piece.trim())out.push({text:piece.trim(),lang});return out;
}
let speechVoices=[];
function populateVoices(){
 if(!synth)return;
 speechVoices=synth.getVoices();
 for(const [el,lang,previous] of [[voiceEL,'el',voiceEL.value||saved.voiceEL],[voiceEN,'en',voiceEN.value||saved.voiceEN]]){
  const vs=speechVoices.filter(v=>v.lang.toLowerCase().startsWith(lang));
  el.replaceChildren();
  if(!vs.length){const o=new Option(lang==='el'?'Δεν βρέθηκε ελληνική φωνή':'No English voice installed','');el.append(o);el.disabled=true;continue;}
  el.disabled=false;
  vs.forEach(v=>el.append(new Option(v.name+' ('+v.lang+')',v.voiceURI)));
  const preferred=vs.find(v=>v.voiceURI===previous)||vs.find(v=>v.default)||vs[0];
  el.value=preferred.voiceURI;
 }
}
if(synth){populateVoices();synth.addEventListener?.('voiceschanged',populateVoices);}
// A missing Greek TTS voice is an operating-system/browser issue, not missing narration data.
if(!synth){status.textContent='Ο browser δεν υποστηρίζει σύνθεση φωνής. Δοκίμασε Chrome ή Edge.';}

voiceEL.onchange=save;voiceEN.onchange=save;autoFollow.onchange=()=>{save();if(autoFollow.checked)scrollTranscriptToCurrent()};
function pickVoice(lang){
 const opts=lang==='en-US'?voiceEN:voiceEL, prefix=lang==='en-US'?'en':'el';
 return speechVoices.find(v=>v.voiceURI===opts.value)||speechVoices.find(v=>v.lang.toLowerCase().startsWith(prefix))||null;
}
// Scroll only the inner transcript pane. Never call scrollIntoView: it can scroll the entire document.
function scrollTranscriptToCurrent(){
 const item=textList.querySelectorAll('.narr-item')[index];
 if(!item)return;
 const viewport=textList.getBoundingClientRect();
 const target=item.getBoundingClientRect();
 const padding=10;
 if(target.top<viewport.top+padding){textList.scrollTop-=viewport.top+padding-target.top;}
 else if(target.bottom>viewport.bottom-padding){textList.scrollTop+=target.bottom-(viewport.bottom-padding);}
}
const highlight=follow=>{
 textList.querySelectorAll('.narr-item').forEach((el,i)=>{const on=i===index;el.classList.toggle('reading',on);el.setAttribute('aria-current',on?'true':'false')});
 seek.value=index+1;
 pos.textContent=`${Math.min(index+1,paragraphs.length)} / ${paragraphs.length}`;
 if(follow&&autoFollow.checked)scrollTranscriptToCurrent();
};
async function load(ch,requestedIndex=0,requestedChunk=0,forceDisk=false){
 revision++;const loadToken=revision;active=false;paused=false;synth?.cancel();
 chapter=ch;chapterSelect.value=String(ch);currentFile=chapters[ch].file;
 const requestedFile=currentFile;
 status.textContent='Φόρτωση κειμένου αφήγησης από TXT…';loading=true;
 try {
   const url='transcripts/'+encodeURIComponent(requestedFile)+'?v='+Date.now();
   const response=await fetch(url,{cache:'no-store'});
   if(!response.ok)throw new Error('HTTP '+response.status);
   const txt=forceDisk?(await response.text()):(custom.get(requestedFile)??await response.text());
   if(loadToken!==revision)return;
   paragraphs=splitText(txt);
   index=Math.max(0,Math.min(requestedIndex,Math.max(0,paragraphs.length-1)));
   chunkIndex=Math.max(0,requestedChunk);
   textList.replaceChildren();const frag=document.createDocumentFragment();
   for(let i=0;i<paragraphs.length;i++){
     const b=document.createElement('button');b.type='button';b.className='narr-item';b.dataset.p=String(i);
     const n=document.createElement('span');n.className='narr-number';n.textContent=String(i+1);
     const label=document.createElement('span');label.textContent=paragraphs[i];b.append(n,label);frag.append(b)
   }
   textList.append(frag);seek.max=String(Math.max(1,paragraphs.length));
   $('#narr-txt').href='transcripts/'+encodeURIComponent(requestedFile);$('#narr-txt').download=requestedFile;
   status.textContent=`Φορτώθηκαν ${paragraphs.length} παράγραφοι από το ${requestedFile}`;
   highlight(false);save();
 }catch(e){
   if(loadToken!==revision)return;
   paragraphs=[];textList.replaceChildren();status.textContent='Αδυναμία ανάγνωσης TXT: '+e.message+'. Άνοιξε το site από run.bat (http://127.0.0.1:2023/), όχι μέσω file://.';
 }finally{if(loadToken===revision)loading=false;}
}
function halt(){revision++;active=false;paused=false;synth?.cancel();save()}
function talk(){if(!synth){status.textContent='Απουσία υποστήριξης ομιλίας στον browser';return}if(loading){status.textContent='Περίμενε να φορτωθεί το TXT';return}if(!paragraphs.length){status.textContent='Δεν βρέθηκε κείμενο TXT';return}if(paused){paused=false;synth.resume();status.textContent='Συνέχεια';return}halt();active=true;read()}
function read(){if(!active)return;if(index>=paragraphs.length){active=false;index=paragraphs.length-1;status.textContent='Η αφήγηση ολοκληρώθηκε';save();return}const parts=languageMode.value==='bilingual'?speechSegments(paragraphs[index]):wrapSpeech(paragraphs[index],NC.language||'el-GR');if(chunkIndex>=parts.length){index++;chunkIndex=0;return read()}const token=revision;const utter=new SpeechSynthesisUtterance(parts[chunkIndex].text);utter.lang=parts[chunkIndex].lang;utter.rate=Number(speed.value);const voice=pickVoice(utter.lang);if(voice)utter.voice=voice;utter.onend=()=>{if(!active||token!==revision)return;chunkIndex++;save();read()};utter.onerror=e=>{if(token!==revision||!active)return;active=false;status.textContent='Σφάλμα ομιλίας: '+e.error;save()};highlight(true);status.textContent=`Ανάγνωση ${index+1}/${paragraphs.length} · ${utter.lang==='en-US'?'English':'Ελληνικά'}`;save();synth.speak(utter)}
function move(to,autoplay=active){halt();index=Math.max(0,Math.min(to,paragraphs.length-1));chunkIndex=0;highlight(true);status.textContent='Επιλέχθηκε παράγραφος '+(index+1);save();if(autoplay)talk()}
bar.querySelector('[data-act="play"]').onclick=talk;
bar.querySelector('[data-act="pause"]').onclick=()=>{if(!synth)return;if(synth.paused){paused=false;synth.resume();status.textContent='Συνέχεια'}else if(synth.speaking){paused=true;synth.pause();status.textContent='Σε παύση'}save()};
bar.querySelector('[data-act="stop"]').onclick=()=>{halt();status.textContent='Διακόπηκε — διατηρήθηκε η θέση'};
bar.querySelector('[data-act="prev"]').onclick=()=>move(index-1);
bar.querySelector('[data-act="next"]').onclick=()=>move(index+1);
chapterSelect.onchange=()=>{load(Number(chapterSelect.value));};
speed.onchange=()=>{save();if(active&&!paused){const old=index,c=chunkIndex;halt();index=old;chunkIndex=c;active=true;read()}};
seek.oninput=()=>move(Number(seek.value)-1);
textList.onclick=e=>{const b=e.target.closest('button[data-p]');if(b)move(Number(b.dataset.p),true)};
$('#narr-upload').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;const content=await file.text();custom.set(currentFile,content);await load(chapter);status.textContent='Χρήση προσωρινά επιλεγμένου TXT («'+file.name+'»). Για μόνιμη αλλαγή επεξεργάσου το TXT στον φάκελο.'};
bar.querySelector('[data-act="reload"]').onclick=()=>{custom.delete(currentFile);load(chapter,index,0,true)};
bar.querySelector('[data-act="expand"]').onclick=e=>{bar.classList.toggle('narr-collapsed');e.currentTarget.setAttribute('aria-expanded',String(!bar.classList.contains('narr-collapsed')));e.currentTarget.textContent=bar.classList.contains('narr-collapsed')?'Ανάπτυξη':'Σύμπτυξη'};
// Narration jump buttons use exact heading IDs validated from Markdown/manifest.
// Never use fuzzy matching: a button must open its own editorial TXT.
for(let i=0;i<group.lessons.length;i++){
 const entry=group.lessons[i];
 if(!entry.anchor)continue;
 const heading=document.getElementById(entry.anchor);
 if(!heading)continue;
 const b=document.createElement('button');
 b.className='narr-heading-play';b.type='button';
 b.setAttribute('aria-label','Άκουσε: '+entry.title);
 b.textContent='🔊 Άκουσε αυτό το μάθημα';
 b.onclick=async()=>{await load(i+1);talk()};
 heading.append(b);
}
load(Math.min(Number(saved.chapter)||0,chapters.length-1),Number(saved.index)||0,Number(saved.chunkIndex)||0);
window.addEventListener('beforeunload',()=>{save();revision++;synth?.cancel()});
})();