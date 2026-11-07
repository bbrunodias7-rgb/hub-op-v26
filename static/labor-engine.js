// Browser-safe, pure planning rules. No storage or UI side effects.
(function(root){
'use strict';
const number=v=>Number(String(v??'').replace(',','.'))||0;
function migrateVehicles(teams){return teams.map((eq,i)=>{if(Array.isArray(eq.veiculos))return eq;return {...eq,veiculos:[{id:`XPT_${i+1}`,nome:eq.nomeVeiculo||`Veículo ${i+1}`,tipo:eq.tipoVeiculo||'Carreta',status:eq.statusCarregamento||'Pendente'}]};});}
function flattenVehicles(teams){return migrateVehicles(teams).flatMap((eq,i)=>eq.veiculos.map(v=>({...v,vaga:eq.vagaCarregamento||String(i+1).padStart(2,'0'),equipe:i,rep2:eq.rep2,reps:eq.reps||[]})));}
function clearTeams(teams){return (teams||[]).map(eq=>({...eq,rep2:'',reps:(eq.reps||[]).map(()=>'')}));}
function plan(candidates,slots){const used=new Set(),rows=[];for(const slot of slots.filter(s=>!s.occupied)){const c=candidates.filter(c=>!used.has(c.nome)&&(!slot.leader||String(c.cargo||c.vinculo).toUpperCase()==='REP II')).sort((a,b)=>number(b[slot.metric])-number(a[slot.metric])||a.nome.localeCompare(b.nome))[0];if(!c)continue;used.add(c.nome);rows.push({key:slot.key,nome:c.nome,metric:slot.metric,score:number(c[slot.metric]),label:slot.label});}return rows;}
function directions(candidates,targets){return plan(candidates,targets.flatMap(t=>Array.from({length:t.count},(_,i)=>({key:`${t.menu}:${i}`,metric:t.metric,label:t.label})))).map(r=>({...r,menu:r.key.split(':')[0]}));}
const api={number,migrateVehicles,flattenVehicles,clearTeams,plan,directions};root.HubLaborEngine=api;if(typeof module!=='undefined')module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
